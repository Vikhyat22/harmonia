import { normalizeArtist, normalizeSourceName, tokenizeTitle, normalizeTitle } from '../services/recommendationIdentity.js';

const AUTOPLAY_LINE = /\[Autoplay\] mode=(?<mode>\S+) seed="(?<seed>.*?)" winner="(?<winner>.*?)" source=(?<source>\S+) total=(?<total>-?\d+) reasons=(?<reasons>.*)$/;
const AUTOPLAY_DEBUG_LINE = /\[AutoplayDebug\] seed=(?<seed>\S+) mode=(?<mode>\S+)$/;
const WINNER_DEBUG_LINE = /^winner: (?<winner>.*?) total=(?<total>-?\d+) provenance=(?<source>\S+) reasons=(?<reasons>.*)$/;
const REJECTED_DEBUG_LINE = /^rejected: (?<label>.*?) total=(?<total>-?\d+) reasons=(?<reasons>.*)$/;
const VARIANT_PATTERN = /\b(remix|mashup|instrumental|edit|edited|live|cover|karaoke|sped up|slowed|reverb|lofi|lo-fi|lyrics?|lyrical|rehearsal|backstage|coreografia|choreography|for cello|for piano|cello and piano|symphony)\b/i;

export function parseAutoplayLogReport(text) {
  const decisions = [];
  const diagnostics = {
    spotifyRecommendationFailures: 0,
    loginRequiredFailures: 0,
    playbackFailures: 0,
  };

  let current = null;

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = stripWorkerPrefix(rawLine);
    const rawLower = rawLine.toLowerCase();

    if (rawLower.includes('recommendations?seed_tracks=') && rawLower.includes('not found')) {
      diagnostics.spotifyRecommendationFailures += 1;
    }

    if (rawLower.includes('this video requires login')) {
      diagnostics.loginRequiredFailures += 1;
    }

    if (rawLower.includes('failed to load track for identifier')) {
      diagnostics.playbackFailures += 1;
    }

    if (!line) {
      continue;
    }

    const autoplayMatch = line.match(AUTOPLAY_LINE);
    if (autoplayMatch) {
      if (current) {
        decisions.push(finalizeDecision(current));
      }

      current = {
        mode: autoplayMatch.groups.mode,
        seedLabel: autoplayMatch.groups.seed,
        winnerLabel: autoplayMatch.groups.winner,
        autoplaySource: autoplayMatch.groups.source,
        total: Number(autoplayMatch.groups.total),
        reasons: splitReasonSummary(autoplayMatch.groups.reasons),
        seed: parseTraceLabel(autoplayMatch.groups.seed),
        winner: parseTraceLabel(autoplayMatch.groups.winner),
        rejected: [],
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const debugMatch = line.match(AUTOPLAY_DEBUG_LINE);
    if (debugMatch && debugMatch.groups.mode === current.mode) {
      current.seedCanonicalKey = debugMatch.groups.seed;
      current.seedSource = deriveSeedSource(debugMatch.groups.seed);
      continue;
    }

    const winnerMatch = line.match(WINNER_DEBUG_LINE);
    if (winnerMatch) {
      current.debugWinner = {
        label: winnerMatch.groups.winner,
        source: winnerMatch.groups.source,
        total: Number(winnerMatch.groups.total),
        reasons: splitReasonSummary(winnerMatch.groups.reasons),
      };
      continue;
    }

    const rejectedMatch = line.match(REJECTED_DEBUG_LINE);
    if (rejectedMatch) {
      current.rejected.push({
        ...parseTraceLabel(rejectedMatch.groups.label),
        label: rejectedMatch.groups.label,
        total: Number(rejectedMatch.groups.total),
        reasons: splitCommaReasons(rejectedMatch.groups.reasons),
      });
    }
  }

  if (current) {
    decisions.push(finalizeDecision(current));
  }

  return { decisions, diagnostics };
}

export function analyzeAutoplayLogReport(input, options = {}) {
  const parsed = typeof input === 'string' ? parseAutoplayLogReport(input) : input;
  const expectedMode = options.mode ?? null;
  const expectedSource = options.source ? normalizeSourceName(options.source) : null;
  const filteredDecisions = parsed.decisions.filter((decision) => {
    if (expectedMode && decision.mode !== expectedMode) {
      return false;
    }

    if (expectedSource && decision.seedSource && decision.seedSource !== expectedSource) {
      return false;
    }

    return true;
  });

  const decisions = filteredDecisions.length > 0 ? filteredDecisions : parsed.decisions;
  const issues = [];
  const warnings = [];
  const passes = [];

  if (decisions.length === 0) {
    return {
      verdict: 'no-data',
      source: expectedSource,
      mode: expectedMode,
      seed: null,
      decisions: [],
      issues: ['No autoplay decisions were found in the provided logs.'],
      warnings: [],
      passes: [],
      diagnostics: parsed.diagnostics,
    };
  }

  const firstDecision = decisions[0];
  const seed = firstDecision.seed;
  const mode = expectedMode ?? firstDecision.mode;
  const source = expectedSource ?? firstDecision.seedSource ?? null;
  const seedArtist = normalizeArtist(seed.artist);
  const seedStem = buildLooseTitleStem(seed.title);

  const winnerArtists = decisions.map((decision) => normalizeArtist(decision.winner.artist));
  const sameArtistIndices = winnerArtists
    .map((artist, index) => artist && artist === seedArtist ? index : -1)
    .filter((index) => index >= 0);

  const titleStemCounts = new Map();
  for (const decision of decisions) {
    const stem = buildLooseTitleStem(decision.winner.title, seed.artist);
    if (!stem || stem === seedStem) {
      continue;
    }
    titleStemCounts.set(stem, (titleStemCounts.get(stem) ?? 0) + 1);
  }

  const repeatedAlternativeTitleStem = [...titleStemCounts.entries()]
    .find(([, count]) => count >= 2)?.[0] ?? null;

  let sawDiversifiedWinner = false;
  let seedArtistReturnedAfterDiversification = false;
  for (const artist of winnerArtists) {
    if (!artist) {
      continue;
    }
    if (artist === seedArtist) {
      if (sawDiversifiedWinner) {
        seedArtistReturnedAfterDiversification = true;
        break;
      }
      continue;
    }
    sawDiversifiedWinner = true;
  }

  const weakStrictWinners = decisions.filter((decision) => {
    if (mode !== 'strict-original') {
      return false;
    }

    const reasons = new Set(decision.reasons);
    const hasCloseSignal = reasons.has('+canonical')
      || reasons.has('+duration_close')
      || reasons.has('+same_album')
      || reasons.has('+same_artist');
    const isVariant = VARIANT_PATTERN.test(decision.winner.title);
    return !hasCloseSignal && !isVariant;
  });

  const variantWinners = decisions.filter((decision) => VARIANT_PATTERN.test(decision.winner.title));

  if (variantWinners.length > 0) {
    issues.push('A winner matched a common variant pattern such as remix, live, or instrumental.');
  }

  if (mode === 'strict-original' && repeatedAlternativeTitleStem) {
    issues.push(`Strict-original drifted into a repeated alternate title lane (${repeatedAlternativeTitleStem}).`);
  }

  if ((mode === 'artist-continuity' || mode === 'discovery' || mode === 'radio') && repeatedAlternativeTitleStem) {
    issues.push(`${mode} fixated on a repeated alternate title lane (${repeatedAlternativeTitleStem}) instead of widening out.`);
  }

  if (mode === 'strict-original' && seedArtistReturnedAfterDiversification) {
    issues.push('Strict-original returned to the seed artist after it had already diversified away.');
  }

  if (mode === 'strict-original' && weakStrictWinners.length >= 2) {
    issues.push('Strict-original winners relied on loose diversity/reliable signals instead of close canonical signals.');
  }

  if (mode === 'artist-continuity') {
    if (sameArtistIndices.length === 0) {
      warnings.push('Artist-continuity never produced a same-artist winner in this sample.');
    }
    if (getMaxConsecutiveSeedArtistRun(winnerArtists, seedArtist) > 2) {
      issues.push('Artist-continuity stayed on the seed artist for too long without diversifying.');
    }
  }

  if (mode === 'discovery' && sameArtistIndices.slice(0, 2).length >= 2) {
    issues.push('Discovery stayed with the seed artist too long instead of branching out early.');
  }

  if (mode === 'radio' && decisions.slice(0, 2).every((decision) => normalizeArtist(decision.winner.artist) === seedArtist)) {
    issues.push('Radio stayed too narrow; the first winners never loosened beyond the seed artist lane.');
  }

  if (parsed.diagnostics.spotifyRecommendationFailures > 0) {
    warnings.push('Spotify native recommendations failed upstream, so fallback sources influenced the results.');
  }

  if (parsed.diagnostics.loginRequiredFailures > 0) {
    warnings.push('At least one YouTube candidate was login-gated and required fallback behavior.');
  }

  if (parsed.diagnostics.playbackFailures > 0) {
    warnings.push('Playback failures were present in the logs; winner quality may reflect fallback recovery instead of the primary path.');
  }

  if (issues.length === 0) {
    if (mode === 'strict-original' && weakStrictWinners.length === 0) {
      passes.push('Strict-original winners stayed on stronger canonical/close signals.');
    }

    if (mode === 'artist-continuity' && sameArtistIndices.length > 0) {
      passes.push('Artist-continuity produced at least one same-artist continuation.');
    }

    if (mode === 'discovery' && sameArtistIndices.length <= 1) {
      passes.push('Discovery branched away from the seed artist quickly.');
    }

    if (mode === 'radio' && sameArtistIndices.length < decisions.length) {
      passes.push('Radio allowed broader related picks instead of staying locked to the seed artist.');
    }

    if (passes.length === 0) {
      passes.push('No contract-breaking patterns were detected in the sampled autoplay run.');
    }
  }

  const verdict = issues.length > 0
    ? 'fail'
    : warnings.length > 0
      ? 'pass-with-caveats'
      : 'pass';

  return {
    verdict,
    source,
    mode,
    seed,
    decisions,
    issues,
    warnings,
    passes,
    diagnostics: parsed.diagnostics,
  };
}

export function formatAutoplayValidationReport(report) {
  if (report.verdict === 'no-data') {
    return [
      'Autoplay Live Validation',
      '',
      'Verdict: NO DATA',
      ...report.issues.map((issue) => `- ${issue}`),
    ].join('\n');
  }

  const lines = [
    'Autoplay Live Validation',
    '',
    `Verdict: ${report.verdict.toUpperCase()}`,
    `Mode: ${report.mode ?? 'unknown'}`,
    `Source: ${report.source ?? 'unknown'}`,
    `Seed: ${report.seed?.title ?? 'unknown'} | ${report.seed?.artist ?? 'unknown'}`,
    `Decisions analyzed: ${report.decisions.length}`,
    '',
    'Observed winners:',
    ...report.decisions.map((decision, index) => {
      const reasonSummary = decision.reasons.length > 0 ? decision.reasons.join(' ') : 'none';
      return `${index + 1}. ${decision.winner.title} | ${decision.winner.artist} [${decision.debugWinner?.source ?? decision.autoplaySource}] ${reasonSummary}`;
    }),
  ];

  if (report.issues.length > 0) {
    lines.push('', 'Issues:', ...report.issues.map((issue) => `- ${issue}`));
  }

  if (report.warnings.length > 0) {
    lines.push('', 'Warnings:', ...report.warnings.map((warning) => `- ${warning}`));
  }

  if (report.passes.length > 0) {
    lines.push('', 'Passes:', ...report.passes.map((pass) => `- ${pass}`));
  }

  return lines.join('\n');
}

export function getPendingValidationRows(markdown) {
  const rows = [];
  let section = null;

  for (const rawLine of String(markdown ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const headingMatch = line.match(/^###\s+(.*)$/);
    if (headingMatch) {
      section = headingMatch[1];
      continue;
    }

    const rowMatch = line.match(/^- \[(?<done>[ xX])\]\s+`(?<mode>[^`]+)`/);
    if (!rowMatch || !section) {
      continue;
    }

    rows.push({
      section,
      mode: rowMatch.groups.mode,
      done: rowMatch.groups.done.toLowerCase() === 'x',
    });
  }

  return rows.filter((row) => !row.done);
}

function finalizeDecision(decision) {
  return {
    ...decision,
    seedSource: decision.seedSource ?? deriveSeedSource(decision.seedCanonicalKey),
  };
}

function stripWorkerPrefix(line) {
  const workerPrefix = line.indexOf('app[worker.1]:');
  if (workerPrefix >= 0) {
    return line.slice(workerPrefix + 'app[worker.1]:'.length).trim();
  }

  const apiPrefix = line.indexOf('app[api]:');
  if (apiPrefix >= 0) {
    return line.slice(apiPrefix + 'app[api]:'.length).trim();
  }

  return line.trim();
}

function parseTraceLabel(value) {
  const label = String(value ?? '').trim();
  const separatorIndex = label.lastIndexOf('|');
  if (separatorIndex < 0) {
    return { label, title: label, artist: 'unknown artist' };
  }

  return {
    label,
    title: label.slice(0, separatorIndex).trim(),
    artist: label.slice(separatorIndex + 1).trim() || 'unknown artist',
  };
}

function splitReasonSummary(value) {
  return String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function splitCommaReasons(value) {
  return String(value ?? '')
    .split(',')
    .map((reason) => reason.trim())
    .filter(Boolean);
}

function deriveSeedSource(canonicalKey) {
  const prefix = String(canonicalKey ?? '').split(':')[0];
  const normalized = normalizeSourceName(prefix);
  if (normalized === 'youtube_music') {
    return 'youtube';
  }

  return normalized;
}

function buildLooseTitleStem(title, seedArtist = null) {
  let cleanTitle = String(title ?? '');
  if (seedArtist) {
    const normalizedSeedArtist = normalizeArtist(seedArtist);
    if (normalizedSeedArtist) {
      const escaped = normalizedSeedArtist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      cleanTitle = cleanTitle.replace(new RegExp(`^${escaped}\\s*`, 'i'), '').trim();
    }
  }
  const tokens = tokenizeTitle(cleanTitle);
  if (tokens.length === 0) {
    return normalizeTitle(cleanTitle);
  }
  return tokens.slice(0, 2).join(' ');
}

function getMaxConsecutiveSeedArtistRun(artists, seedArtist) {
  let longest = 0;
  let current = 0;

  for (const artist of artists) {
    if (artist && artist === seedArtist) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }

  return longest;
}
