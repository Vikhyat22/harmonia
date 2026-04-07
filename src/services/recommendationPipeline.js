import { getSpotifyRecommendations, extractSpotifyTrackId, searchSpotifyTracks } from './spotifyRecommendations.js';
import lavalinkResolver from './lavalinkMusicResolver.js';
import {
  buildCanonicalKey,
  normalizeArtist,
  normalizeSourceName,
  normalizeTitle,
  uniqueTitleTokens
} from './recommendationIdentity.js';
import {
  GENERIC_RESULT_PATTERNS,
  buildSongSignature,
  hasTitleCling,
  isCanonicalOriginalTrack,
  isSameSongFamily,
  isUnwantedVariant
} from './recommendationRules.js';

const MAX_SAME_ARTIST_STREAK = 1;
const MAX_AUTOPLAY_FALLBACKS = 4;
const SESSION_VARIETY_POLICY = {
  'strict-original': {
    scoreWindow: 12,
    maxCandidates: 3,
    minTotal: 18
  },
  'artist-continuity': {
    scoreWindow: 14,
    maxCandidates: 3,
    minTotal: 16
  },
  discovery: {
    scoreWindow: 16,
    maxCandidates: 4,
    minTotal: 14
  },
  radio: {
    scoreWindow: 18,
    maxCandidates: 4,
    minTotal: 14
  }
};

/**
 * @typedef {Object} RecommendationSeed
 * @property {string} guildId
 * @property {'strict-original'|'artist-continuity'|'discovery'|'radio'} mode
 * @property {Object} track
 * @property {string|null} canonicalKey
 * @property {string|null} spotifyTrackId
 * @property {string|null} youtubeId
 * @property {string} title
 * @property {string} artist
 * @property {string|null} album
 * @property {number|null} durationMs
 * @property {string|null} sourceType
 * @property {string|null} providerSourceType
 */

/**
 * @typedef {Object} RecommendationCandidate
 * @property {Object} track
 * @property {string} canonicalKey
 * @property {string} artistKey
 * @property {string} titleKey
 * @property {Object} provenance
 * @property {string} provenance.source
 * @property {string|null} provenance.query
 * @property {number|null} provenance.rank
 * @property {Object} features
 * @property {boolean} features.sameArtist
 * @property {boolean} features.sameAlbum
 * @property {boolean} features.sameSongFamily
 * @property {boolean} features.isCanonicalOriginal
 * @property {boolean} features.isUnwantedVariant
 * @property {boolean} features.isRecentRepeat
 * @property {boolean} features.isSkippedRecently
 * @property {number|null} features.durationDeltaRatio
 * @property {number} features.titleOverlap
 * @property {Object} scoreBreakdown
 * @property {number} scoreBreakdown.mode
 * @property {number} scoreBreakdown.originality
 * @property {number} scoreBreakdown.similarity
 * @property {number} scoreBreakdown.diversity
 * @property {number} scoreBreakdown.reliability
 * @property {number} scoreBreakdown.total
 * @property {string[]} rejectionReasons
 */

export function buildRecommendationSeeds({ guildId, lastItem, anchorSeed, historyTracks = [], mode = 'artist-continuity' }) {
  const seeds = [];
  const primarySeed = getSeedTrack(lastItem, anchorSeed, historyTracks);
  if (primarySeed) {
    seeds.push(createRecommendationSeed(guildId, mode, primarySeed));
  }

  if (anchorSeed) {
    seeds.push(createRecommendationSeed(guildId, mode, anchorSeed));
  }

  const historySeed = historyTracks
    .find((track) => track.kind === 'music' && track.source !== 'autoplay');

  if (historySeed) {
    seeds.push(createRecommendationSeed(guildId, mode, {
      ...lastItem,
      title: historySeed.title ?? lastItem?.title,
      artist: historySeed.artist ?? lastItem?.artist,
      playbackInput: null,
      sourceUrl: null,
      sourceType: historySeed.source_type ?? null,
      source: historySeed.source ?? 'music'
    }));
  }

  return dedupeSeeds(seeds);
}

export async function getRecommendationForSeed({
  seed,
  recentCanonicalKeys = [],
  recentTracks = [],
  recentAutoplayArtists = [],
  memoryContext = {}
}) {
  const sourceName = seed.providerSourceType ?? getSeedProviderSourceName(seed.track);
  const spotifyId = seed.spotifyTrackId;
  const cleanTitle = normalizeTitle(seed.title);
  const isTextSeed = seed.sourceType === 'text';
  const context = buildRecommendationContext(seed, {
    recentCanonicalKeys,
    recentTracks,
    recentAutoplayArtists,
    memoryContext
  });
  const preferNativeFirst = shouldPreferNativeFirst(seed, sourceName);
  const deferSameArtistCatalog = shouldDeferSameArtistCatalog(seed, sourceName);

  if (isTextSeed) {
    const textSeedSearchTrack = await getCanonicalSearchRecommendation(seed, context, cleanTitle, true);
    if (textSeedSearchTrack) {
      return textSeedSearchTrack;
    }
  }

  if (deferSameArtistCatalog) {
    const nativeTrack = await getNativeRecommendation(seed, context);
    if (nativeTrack) {
      return nativeTrack;
    }
  } else if (preferNativeFirst) {
    const nativeTrack = await getNativeRecommendation(seed, context);
    if (nativeTrack) {
      return nativeTrack;
    }

    const sameArtistTrack = await getSameArtistCatalogFallback(seed, context);
    if (sameArtistTrack) {
      return sameArtistTrack;
    }
  } else {
    const sameArtistTrack = await getSameArtistCatalogFallback(seed, context);
    if (sameArtistTrack) {
      return sameArtistTrack;
    }

    const nativeTrack = await getNativeRecommendation(seed, context);
    if (nativeTrack) {
      return nativeTrack;
    }
  }

  if (sourceName === 'spotify' || spotifyId) {
    if (spotifyId) {
      const recs = await getSpotifyRecommendations(spotifyId, 10);
      for (const rec of recs) {
        const track = await lavalinkResolver.resolveTrack(rec.spotifyUri, 'spotify');
        const candidate = createRecommendationCandidate(track, seed, context, {
          source: 'spotify-rec',
          query: rec.spotifyUri,
          rank: null
        });
        if (candidate && candidate.rejectionReasons.length === 0) {
          return buildAutoplayRecommendation(seed, { accepted: [candidate], rejected: [] });
        }

      const ytTrack = await pickFromSearch(`${rec.artist} ${rec.title}`, seed, context, 'ytm-search');
      if (ytTrack) return ytTrack;
    }
  }

    const mirroredTrack = await getSpotifyYouTubeMirrorRecommendation(seed, context);
    if (mirroredTrack) {
      return mirroredTrack;
    }
  }

  if (deferSameArtistCatalog) {
    const sameArtistTrack = await getSameArtistCatalogFallback(seed, context);
    if (sameArtistTrack) {
      return sameArtistTrack;
    }
  }

  const canonicalSearchTrack = await getCanonicalSearchRecommendation(seed, context, cleanTitle, sourceName !== 'spotify' || isTextSeed);
  if (canonicalSearchTrack) return canonicalSearchTrack;

  return null;
}

export function evaluateRecommendationPool({
  seed,
  candidates = [],
  provenance = { source: 'fixture', query: 'fixture', rank: null },
  recentCanonicalKeys = [],
  recentTracks = [],
  recentAutoplayArtists = [],
  memoryContext = {}
}) {
  const context = buildRecommendationContext(seed, {
    recentCanonicalKeys,
    recentTracks,
    recentAutoplayArtists,
    memoryContext
  });
  const evaluated = evaluateAutoplayCandidates(candidates, seed, context, provenance);

  return {
    winner: evaluated.accepted[0] ?? null,
    accepted: evaluated.accepted,
    rejected: evaluated.rejected,
    debugTrace: evaluated.accepted[0]
      ? buildAutoplayDebugTrace(seed, evaluated.accepted[0], evaluated.rejected)
      : null
  };
}

export function getTrackAlbum(track) {
  const spotifyAlbum = track?.metadata?.spotifyAlbum;
  if (spotifyAlbum) {
    return spotifyAlbum;
  }

  const sourceName = getSeedProviderSourceName(track);
  if (sourceName === 'youtube' || sourceName === 'youtube_music') {
    return null;
  }

  return track?.metadata?.lavalinkTrack?.pluginInfo?.albumName ?? null;
}

export function getSeedSpotifyTrackId(seedTrack) {
  const candidates = [
    seedTrack?.metadata?.spotifyTrackId,
    extractSpotifyTrackId(seedTrack?.metadata?.spotifyUri),
    extractSpotifyTrackId(seedTrack?.metadata?.canonicalUrl),
    extractSpotifyTrackId(seedTrack?.playbackInput),
    extractSpotifyTrackId(seedTrack?.sourceUrl),
  ].filter(isSpotifyTrackId);

  return candidates[0] ?? null;
}

function createRecommendationSeed(guildId, mode, track) {
  const spotifyTrackId = getSeedSpotifyTrackId(track);
  const youtubeId = track?.metadata?.identifier
    ?? track?.metadata?.lavalinkTrack?.info?.identifier
    ?? null;
  const sourceType = getRecommendationSeedType(track);
  const providerSourceType = getSeedProviderSourceName(track);

  return {
    guildId,
    mode,
    track,
    canonicalKey: buildCanonicalKey(track),
    spotifyTrackId,
    youtubeId,
    title: track?.title ?? '',
    artist: track?.artist ?? '',
    album: getTrackAlbum(track),
    durationMs: track?.durationMs ?? null,
    sourceType,
    providerSourceType
  };
}

function getSeedTrack(lastItem, anchorSeed, historyTracks) {
  if (lastItem?.source !== 'autoplay') {
    return lastItem;
  }

  if (lastItem?.kind === 'music') {
    return lastItem;
  }

  const metadataSeed = lastItem?.metadata?.autoplaySeed;
  if (metadataSeed?.title || metadataSeed?.artist || metadataSeed?.playbackInput) {
    return {
      ...lastItem,
      title: metadataSeed.title ?? lastItem.title,
      artist: metadataSeed.artist ?? lastItem.artist,
      playbackInput: metadataSeed.playbackInput ?? lastItem.playbackInput,
      sourceUrl: metadataSeed.playbackInput ?? lastItem.sourceUrl,
      sourceType: metadataSeed.sourceType ?? lastItem.sourceType,
      metadata: {
        ...lastItem.metadata,
        autoplaySeedType: metadataSeed.seedType ?? lastItem.metadata?.autoplaySeedType ?? null,
        canonicalUrl: metadataSeed.canonicalUrl ?? lastItem.metadata?.canonicalUrl ?? null,
        spotifyUri: metadataSeed.spotifyUri ?? lastItem.metadata?.spotifyUri ?? null,
        spotifyTrackId: metadataSeed.spotifyTrackId ?? lastItem.metadata?.spotifyTrackId ?? null,
        spotifyArtistNames: metadataSeed.spotifyArtistNames ?? lastItem.metadata?.spotifyArtistNames ?? null,
        spotifyAlbum: metadataSeed.spotifyAlbum ?? lastItem.metadata?.spotifyAlbum ?? null,
        spotifyIsrc: metadataSeed.spotifyIsrc ?? lastItem.metadata?.spotifyIsrc ?? null,
        identifier: metadataSeed.identifier ?? lastItem.metadata?.identifier ?? null,
        sourceName: metadataSeed.providerSourceType ?? metadataSeed.sourceName ?? lastItem.metadata?.sourceName ?? null,
        canonicalSourceType: metadataSeed.providerSourceType ?? metadataSeed.canonicalSourceType ?? lastItem.metadata?.canonicalSourceType ?? null,
      },
      source: 'music'
    };
  }

  const historySeed = historyTracks
    .find((track) => track.kind === 'music' && track.source !== 'autoplay');

  if (historySeed) {
    return {
      ...lastItem,
      title: historySeed.title ?? lastItem.title,
      artist: historySeed.artist ?? lastItem.artist,
      playbackInput: null,
      sourceUrl: null,
      sourceType: historySeed.source_type ?? null,
      source: historySeed.source ?? 'music'
    };
  }

  return anchorSeed ?? lastItem;
}

function getRecommendationSeedType(track) {
  const explicitSeedType = normalizeSeedType(
    track?.metadata?.autoplaySeedType
    ?? track?.metadata?.autoplaySeed?.seedType
  );
  if (explicitSeedType) {
    return explicitSeedType;
  }

  const resolvedBy = String(track?.metadata?.resolvedBy ?? '').trim().toLowerCase();
  if (resolvedBy.startsWith('search:') && !resolvedBy.endsWith(':url-fallback')) {
    return 'text';
  }

  return getSeedProviderSourceName(track);
}

function normalizeSeedType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'text' || normalized === 'history') {
    return normalized;
  }

  return normalizeSourceName(normalized);
}

function dedupeSeeds(seeds) {
  const seen = new Set();
  const uniqueSeeds = [];

  for (const seed of seeds) {
    if (!seed) continue;

    const key = [seed.canonicalKey, normalizeArtist(seed.artist), buildSongSignature(seed.title)].join('|');
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueSeeds.push(seed);
  }

  return uniqueSeeds;
}

function buildRecommendationContext(
  seed,
  { recentCanonicalKeys = [], recentTracks = [], recentAutoplayArtists = [], memoryContext = {} }
) {
  const musicRecentTracks = recentTracks
    .filter((track) => track.kind === 'music');
  const seedArtist = normalizeArtist(seed.artist);
  const sameArtistLimit = getSameArtistLimit(seed);
  const recentCanonicalSet = new Set([
    ...recentCanonicalKeys,
    ...(memoryContext.recentCanonicalKeys ?? []),
    ...musicRecentTracks.map((track) => buildCanonicalKey(track)),
  ].filter(Boolean));
  const skippedCanonicalSet = new Set(memoryContext.skippedCanonicalKeys ?? []);
  const failedCanonicalSet = new Set(memoryContext.failedCanonicalKeys ?? []);
  const recentArtistSet = new Set(
    [
      ...(memoryContext.recentArtistKeys ?? []),
      ...musicRecentTracks
        .map((track) => normalizeArtist(track.artist))
        .filter(Boolean)
        .slice(0, 5)
    ]
  );
  const autoplayArtistHistory = (memoryContext.recentAutoplayArtistKeys?.length ?? 0) > 0
    ? memoryContext.recentAutoplayArtistKeys
    : recentAutoplayArtists;
  const seedSession = memoryContext.seedSession ?? null;

  let sameArtistStreak = 0;
  if (seedArtist) {
    for (const artist of [...autoplayArtistHistory].reverse()) {
      if (artist !== seedArtist) {
        break;
      }
      sameArtistStreak += 1;
    }

    for (const track of musicRecentTracks) {
      if (sameArtistStreak >= sameArtistLimit) {
        break;
      }
      if (track.source !== 'autoplay') {
        break;
      }
      if (normalizeArtist(track.artist) !== seedArtist) {
        break;
      }
      sameArtistStreak += 1;
    }
  }

  const historyTitles = musicRecentTracks.map((track) => buildSongSignature(track.title));
  const avoidSet = new Set(historyTitles.filter(Boolean));
  const recentTitleFamilySet = new Set([
    ...historyTitles,
    ...((seedSession?.recentTitleFamilies ?? []).filter(Boolean))
  ]);
  if (seed.canonicalKey) {
    recentCanonicalSet.add(seed.canonicalKey);
  }

  return {
    avoidSet,
    recentCanonicalSet,
    skippedCanonicalSet,
    failedCanonicalSet,
    recentTracks: musicRecentTracks,
    recentArtistSet,
    sameArtistStreak,
    sameArtistLimit,
    seedSession,
    seedArtistReturnBlocked: Boolean(
      seed.mode === 'strict-original'
      && seedSession?.artistKey === seedArtist
      && seedSession?.hasDiversifiedAwayFromSeedArtist
    ),
    recentTitleFamilySet,
    spotifyNativeRecommendationBlocked: Boolean(
      getSeedProviderSourceName(seed.track) === 'spotify'
      && seedSession?.spotifyNativeRecommendationsFailed
    ),
  };
}

async function getSpotifyYouTubeMirrorRecommendation(seed, context) {
  const artist = seed.artist;
  const title = seed.title;
  if (!artist || artist === 'Unknown Artist' || !title) {
    return null;
  }

  const seedIdentifier = seed.track?.metadata?.identifier
    ?? seed.track?.metadata?.lavalinkTrack?.info?.identifier
    ?? null;

  if (seedIdentifier) {
    const directRelated = await lavalinkResolver.searchYouTubeRelated(seedIdentifier, 10).catch(() => []);
    const directTrack = pickUsableRecommendation(directRelated, seed, context, {
      source: 'yt-related',
      query: seedIdentifier
    });
    if (directTrack) {
      return directTrack;
    }
  }

  const mirrorSeed = await lavalinkResolver.resolveTextQuery(`${artist} ${title}`, {
    sources: ['youtube_music', 'youtube']
  }).catch(() => null);

  const identifier = mirrorSeed?.metadata?.identifier;
  if (!identifier) {
    return null;
  }

  const related = await lavalinkResolver.searchYouTubeRelated(identifier, 10).catch(() => []);
  return pickUsableRecommendation(related, seed, context, {
    source: 'yt-related',
    query: identifier
  });
}

async function getNativeRecommendation(seed, context) {
  const sourceName = seed.providerSourceType ?? getSeedProviderSourceName(seed.track);

  if (sourceName === 'spotify') {
    if (context?.spotifyNativeRecommendationBlocked) {
      return null;
    }

    const spotifySeeds = getSpotifySeedIds(seed.track);
    const results = await lavalinkResolver.searchSpotifyRecommendations(spotifySeeds, 10);
    if ((results?.length ?? 0) === 0 && context?.seedSession) {
      context.seedSession.spotifyNativeRecommendationsFailed = true;
    }
    const track = pickUsableRecommendation(results, seed, context, {
      source: 'native-rec',
      query: spotifySeeds.join(',')
    });
    if (track) return track;
  }

  if (sourceName === 'youtube' || sourceName === 'youtube_music') {
    const identifier = getSeedIdentifier(seed.track);
    const results = await lavalinkResolver.searchYouTubeRelated(identifier, 10);
    const track = pickUsableRecommendation(results, seed, context, {
      source: 'yt-related',
      query: identifier
    });
    if (track) return track;
  }

  return null;
}

function getSeedProviderSourceName(seedTrack) {
  const explicitSource = normalizeSourceName(
    seedTrack?.metadata?.canonicalSourceType
    ?? seedTrack?.metadata?.sourceName
    ?? seedTrack?.metadata?.lavalinkTrack?.info?.sourceName
    ?? seedTrack?.sourceType
  );

  if (explicitSource) {
    return explicitSource;
  }

  if (getSeedSpotifyTrackId(seedTrack)) {
    return 'spotify';
  }

  return null;
}

function getSeedIdentifier(seedTrack) {
  return seedTrack?.metadata?.identifier
    ?? seedTrack?.metadata?.spotifyTrackId
    ?? seedTrack?.metadata?.lavalinkTrack?.info?.identifier
    ?? extractSpotifyTrackId(
      seedTrack?.metadata?.canonicalUrl
      ?? seedTrack?.metadata?.spotifyUri
      ?? seedTrack?.playbackInput
      ?? seedTrack?.sourceUrl
    )
    ?? null;
}

function getSpotifySeedIds(seedTrack) {
  const ids = [
    seedTrack?.metadata?.spotifyTrackId,
    extractSpotifyTrackId(seedTrack?.metadata?.spotifyUri),
    extractSpotifyTrackId(seedTrack?.metadata?.canonicalUrl),
    extractSpotifyTrackId(seedTrack?.playbackInput),
    extractSpotifyTrackId(seedTrack?.sourceUrl),
  ].filter(isSpotifyTrackId);

  return [...new Set(ids)];
}

function pickUsableRecommendation(results, seed, context, provenance) {
  const evaluated = evaluateAutoplayCandidates(results, seed, context, provenance);
  return buildAutoplayRecommendation(seed, evaluated);
}

function createRecommendationCandidate(track, seed, context, provenance, extraReliability = 0) {
  if (!track) {
    return null;
  }

  const candidateAlbum = normalizeTitle(getTrackAlbum(track));
  const seedAlbum = normalizeTitle(seed.album);
  const canonicalKey = buildCanonicalKey(track);
  const scoreBreakdown = scoreCandidate(track, seed, context, provenance, extraReliability);
  const features = {
    sameArtist: normalizeArtist(track.artist) === normalizeArtist(seed.artist),
    sameAlbum: Boolean(seedAlbum && candidateAlbum && candidateAlbum === seedAlbum),
    sameSongFamily: isSameSongFamily(track, seed.track),
    isCanonicalOriginal: isCanonicalOriginalTrack(track),
    isUnwantedVariant: isUnwantedVariant(track, seed.track),
    isRecentRepeat: context.recentCanonicalSet.has(canonicalKey) || context.avoidSet.has(buildSongSignature(track.title)),
    isSkippedRecently: context.skippedCanonicalSet.has(canonicalKey),
    isFailedRecently: context.failedCanonicalSet.has(canonicalKey),
    durationDeltaRatio: calculateDurationDeltaRatio(track, seed.track),
    titleOverlap: calculateTitleOverlap(track, seed.track)
  };
  const rejectionReasons = getCandidateRejectionReasons(track, seed, context, scoreBreakdown, features, provenance);

  return {
    track,
    canonicalKey,
    artistKey: normalizeArtist(track.artist),
    titleKey: normalizeTitle(track.title),
    provenance: {
      source: provenance?.source ?? 'unknown',
      query: provenance?.query ?? null,
      rank: provenance?.rank ?? null
    },
    features,
    scoreBreakdown,
    rejectionReasons,
  };
}

function getCandidateRejectionReasons(track, seed, context, scoreBreakdown = {}, features = {}, provenance = {}) {
  const reasons = [];
  const seedArtist = normalizeArtist(seed.artist);
  const candidateArtist = normalizeArtist(track?.artist);
  const candidateCanonicalKey = buildCanonicalKey(track);

  if (!track) reasons.push('missing_track');
  if (isSameTrack(track, seed.track)) reasons.push('same_track');
  if (isSameSongFamily(track, seed.track)) reasons.push('same_song_family');
  if (isUnwantedVariant(track, seed.track)) reasons.push('unwanted_variant');
  if (hasTitleCling(track, seed.track)) reasons.push('title_cling');
  if (
    context?.sameArtistStreak >= (context?.sameArtistLimit ?? MAX_SAME_ARTIST_STREAK)
    && seedArtist
    && candidateArtist === seedArtist
  ) {
    reasons.push('same_artist_streak');
  }
  if (context?.seedArtistReturnBlocked && seedArtist && candidateArtist === seedArtist) {
    reasons.push('seed_artist_return');
  }
  if (
    (seed?.mode === 'discovery' || seed?.mode === 'radio')
    && context?.recentTitleFamilySet?.has(buildSongSignature(track?.title, track?.artist))
  ) {
    reasons.push('title_family_loop');
  }
  if (context?.recentCanonicalSet.has(candidateCanonicalKey) || context?.avoidSet.has(buildSongSignature(track?.title))) reasons.push('recent_repeat');
  if (context?.skippedCanonicalSet.has(candidateCanonicalKey)) reasons.push('skipped_recently');
  if (context?.failedCanonicalSet.has(candidateCanonicalKey)) reasons.push('failed_recently');
  if (seed?.mode === 'strict-original' && !passesStrictOriginalSignalFloor(seed, features, scoreBreakdown, provenance)) reasons.push('strict_signal_floor');

  return reasons;
}

async function pickFromSearch(query, seed, context, provenanceSource) {
  try {
    const results = await searchAutoplayCandidates(query, seed);
    if (!results || results.length === 0) return null;

    const evaluated = evaluateAutoplayCandidates(results, seed, context, {
      source: provenanceSource,
      query,
    });
    return buildAutoplayRecommendation(seed, evaluated);
  } catch {
    return null;
  }
}

async function searchAutoplayCandidates(query, seed) {
  const sources = getAutoplaySearchSources(seed);
  const seen = new Set();
  const combined = [];

  for (const source of sources) {
    const results = await lavalinkResolver.searchSource(query, source, getSearchLimitForSource(source)).catch(() => []);
    for (const track of results ?? []) {
      const key = buildCanonicalKey(track)
        ?? String(track?.playbackInput ?? track?.sourceUrl ?? track?.metadata?.identifier ?? '')
          .trim()
          .toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      combined.push({
        ...track,
        provenance: {
          source: getSearchProvenanceSource(source),
          query,
          rank: combined.length
        }
      });
    }
  }

  return combined;
}

async function getSameArtistCatalogFallback(seed, context) {
  if (seed?.mode === 'discovery' || seed?.mode === 'radio') {
    return null;
  }

  const sourceName = seed.providerSourceType ?? getSeedProviderSourceName(seed.track);
  if (sourceName === 'soundcloud' || sourceName === 'deezer') {
    const results = await searchSameArtistProviderTracks(seed.track, sourceName);
    if (!results.length) {
      return null;
    }

    return pickUsableRecommendation(results, seed, context, {
      source: getSearchProvenanceSource(sourceName),
      query: seed.artist
    });
  }

  return getSameArtistSpotifyFallback(seed, context);
}

async function getSameArtistSpotifyFallback(seed, context) {
  const artist = seed.artist;
  if (!artist || artist === 'Unknown Artist' || context?.sameArtistStreak >= (context?.sameArtistLimit ?? MAX_SAME_ARTIST_STREAK)) {
    return null;
  }

  const results = await searchSameArtistSpotifyTracks(seed.track);
  if (!results.length) {
    return null;
  }

  const sourceName = seed.providerSourceType ?? getSeedProviderSourceName(seed.track);
  const strictOriginalFallback = seed?.mode === 'strict-original';
  const artistKey = normalizeArtist(artist);
  const accepted = [];
  const rejected = [];
  let searchRank = 0;

  for (const result of results) {
    searchRank += 1;

    if (normalizeArtist(result.artist) !== artistKey) {
      continue;
    }
    if (isSameSongFamily(result, seed.track) || hasTitleCling(result, seed.track)) {
      continue;
    }
    if (context.recentCanonicalSet.has(buildCanonicalKey(result)) || context.avoidSet.has(buildSongSignature(result.title))) {
      continue;
    }

    if (sourceName !== 'spotify') {
      const ytTrack = await pickFromSearch(`${result.artist} ${result.title}`, seed, context, 'ytm-search');
      if (ytTrack) {
        return ytTrack;
      }
      continue;
    }

    const track = await lavalinkResolver.resolveTrack(result.spotifyUri, 'spotify').catch(() => null);
    const resolvedCandidate = createRecommendationCandidate(track, seed, context, {
      source: 'spotify-search',
      query: result.spotifyUri,
      rank: searchRank
    }, Math.round((result.popularity ?? 0) / 10));
    pushCandidateBucket(resolvedCandidate, accepted, rejected);

    if (strictOriginalFallback) {
      continue;
    }

    const ytTrack = await pickFromSearch(`${result.artist} ${result.title}`, seed, context, 'ytm-search');
    if (ytTrack) {
      pushCandidateBucket(createRecommendationCandidate(ytTrack, seed, context, {
        source: 'ytm-search',
        query: `${result.artist} ${result.title}`,
        rank: searchRank
      }), accepted, rejected);
    }
  }

  accepted.sort(compareCandidatesDescending);
  const reorderedAccepted = applySessionVarietySelection(accepted, seed, context);
  rejected.sort(compareCandidatesDescending);
  return buildAutoplayRecommendation(seed, { accepted: reorderedAccepted, rejected });
}

async function searchSameArtistProviderTracks(seedTrack, providerSource) {
  const artist = String(seedTrack?.artist ?? '').trim();
  const artistKey = normalizeArtist(artist);
  if (!artist || !artistKey) {
    return [];
  }

  const seen = new Set();
  const combined = [];
  const queries = buildSameArtistProviderQueries(seedTrack, providerSource);
  const maxCandidates = providerSource === 'deezer' ? 6 : 5;

  for (const query of queries) {
    const results = await lavalinkResolver.searchSource(query, providerSource, maxCandidates).catch(() => []);
    for (const track of results ?? []) {
      const key = buildCanonicalKey(track)
        ?? String(track?.playbackInput ?? track?.sourceUrl ?? track?.metadata?.identifier ?? '')
          .trim()
          .toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }

      if (normalizeArtist(track.artist) !== artistKey) {
        continue;
      }

      seen.add(key);
      combined.push({
        ...track,
        provenance: {
          source: getSearchProvenanceSource(providerSource),
          query,
          rank: combined.length
        }
      });
    }

    if (combined.length >= maxCandidates) {
      break;
    }
  }

  return combined.slice(0, maxCandidates);
}

function evaluateAutoplayCandidates(results, seed, context, provenance) {
  const accepted = [];
  const rejected = [];

  for (const [index, track] of (results ?? []).entries()) {
    const candidateProvenance = track?.provenance
      ? {
          source: track.provenance.source ?? provenance?.source ?? 'unknown',
          query: track.provenance.query ?? provenance?.query ?? null,
          rank: track.provenance.rank ?? index
        }
      : {
          source: provenance?.source ?? 'unknown',
          query: provenance?.query ?? null,
          rank: index
        };
    const candidate = createRecommendationCandidate(track, seed, context, {
      source: candidateProvenance.source,
      query: candidateProvenance.query,
      rank: candidateProvenance.rank
    });
    pushCandidateBucket(candidate, accepted, rejected);
  }

  accepted.sort(compareCandidatesDescending);
  const reorderedAccepted = applySessionVarietySelection(accepted, seed, context);
  rejected.sort(compareCandidatesDescending);

  return { accepted: reorderedAccepted, rejected };
}

function buildAutoplayRecommendation(seed, evaluatedCandidates) {
  const primaryCandidate = evaluatedCandidates?.accepted?.[0] ?? null;
  const primary = primaryCandidate?.track ?? null;
  if (!primary) {
    return null;
  }

  const fallbackCandidates = (evaluatedCandidates?.accepted ?? [])
    .slice(1, MAX_AUTOPLAY_FALLBACKS + 1)
    .map((candidate) => serializeAutoplayFallbackCandidate(candidate.track))
    .filter(Boolean);
  const autoplayDebugTrace = buildAutoplayDebugTrace(seed, primaryCandidate, evaluatedCandidates?.rejected ?? []);

  return {
    ...primary,
    metadata: {
      ...primary.metadata,
      ...(fallbackCandidates.length > 0 ? { autoplayFallbackCandidates: fallbackCandidates } : {}),
      autoplayDebugTrace,
    }
  };
}

function buildAutoplayDebugTrace(seed, winnerCandidate, rejectedCandidates = []) {
  return {
    guildId: seed.guildId,
    mode: seed.mode,
    seed: {
      canonicalKey: seed.canonicalKey,
      title: seed.title,
      artist: seed.artist,
      sourceType: seed.sourceType
    },
    winner: serializeTraceCandidate(winnerCandidate),
    rejectedTopCandidates: rejectedCandidates
      .slice(0, 5)
      .map((candidate) => serializeTraceCandidate(candidate))
  };
}

function serializeTraceCandidate(candidate) {
  if (!candidate) {
    return null;
  }

  return {
    canonicalKey: candidate.canonicalKey,
    title: candidate.track?.title ?? '',
    artist: candidate.track?.artist ?? '',
    provenance: candidate.provenance,
    scoreBreakdown: candidate.scoreBreakdown,
    rejectionReasons: candidate.rejectionReasons,
    reasonSummary: summarizeCandidateReasons(candidate),
  };
}

function summarizeCandidateReasons(candidate) {
  if (!candidate) {
    return [];
  }

  const reasons = [];
  if (candidate.features?.sameArtist) reasons.push('+same_artist');
  if (candidate.features?.sameAlbum) reasons.push('+same_album');
  if (candidate.features?.isCanonicalOriginal) reasons.push('+canonical');
  if ((candidate.features?.durationDeltaRatio ?? 1) <= 0.12) reasons.push('+duration_close');
  if ((candidate.scoreBreakdown?.diversity ?? 0) > 0) reasons.push('+diversity');
  if ((candidate.scoreBreakdown?.reliability ?? 0) > 0) reasons.push('+reliable');
  return reasons;
}

function pushCandidateBucket(candidate, accepted, rejected) {
  if (!candidate) {
    return;
  }

  if (candidate.rejectionReasons.length === 0) {
    accepted.push(candidate);
    return;
  }

  rejected.push(candidate);
}

function compareCandidatesDescending(left, right) {
  const scoreDelta = (right?.scoreBreakdown?.total ?? 0) - (left?.scoreBreakdown?.total ?? 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const originalityDelta = (right?.scoreBreakdown?.originality ?? 0) - (left?.scoreBreakdown?.originality ?? 0);
  if (originalityDelta !== 0) {
    return originalityDelta;
  }

  const similarityDelta = (right?.scoreBreakdown?.similarity ?? 0) - (left?.scoreBreakdown?.similarity ?? 0);
  if (similarityDelta !== 0) {
    return similarityDelta;
  }

  const reliabilityDelta = (right?.scoreBreakdown?.reliability ?? 0) - (left?.scoreBreakdown?.reliability ?? 0);
  if (reliabilityDelta !== 0) {
    return reliabilityDelta;
  }

  const rankDelta = (left?.provenance?.rank ?? Number.MAX_SAFE_INTEGER) - (right?.provenance?.rank ?? Number.MAX_SAFE_INTEGER);
  if (rankDelta !== 0) {
    return rankDelta;
  }

  return String(left?.canonicalKey ?? left?.track?.title ?? '')
    .localeCompare(String(right?.canonicalKey ?? right?.track?.title ?? ''));
}

function applySessionVarietySelection(accepted, seed, context) {
  if (!Array.isArray(accepted) || accepted.length < 2) {
    return accepted;
  }

  const selectionSalt = context?.seedSession?.selectionSalt;
  if (!selectionSalt) {
    return accepted;
  }

  const policy = SESSION_VARIETY_POLICY[seed?.mode];
  if (!policy) {
    return accepted;
  }

  const topScore = accepted[0]?.scoreBreakdown?.total ?? 0;
  const eligible = accepted.filter((candidate, index) => {
    if (index >= policy.maxCandidates) {
      return false;
    }

    const total = candidate?.scoreBreakdown?.total ?? Number.NEGATIVE_INFINITY;
    if (topScore - total > policy.scoreWindow || total < policy.minTotal) {
      return false;
    }

    return qualifiesForSessionVariety(candidate, seed);
  });

  if (eligible.length < 2) {
    return accepted;
  }

  const autoplayStep = Math.max(0, Number(context?.seedSession?.autoplayStep) || 0);
  const selected = eligible
    .map((candidate) => ({
      candidate,
      hash: computeSessionVarietyHash([
        selectionSalt,
        autoplayStep,
        seed?.mode ?? '',
        candidate?.canonicalKey ?? candidate?.track?.playbackInput ?? candidate?.track?.title ?? ''
      ].join(':'))
    }))
    .sort((left, right) => right.hash - left.hash || compareCandidatesDescending(left.candidate, right.candidate))[0]?.candidate;

  if (!selected || selected === accepted[0]) {
    return accepted;
  }

  return [
    selected,
    ...accepted.filter((candidate) => candidate !== selected)
  ];
}

function qualifiesForSessionVariety(candidate, seed) {
  if (!candidate) {
    return false;
  }

  if ((candidate.scoreBreakdown?.total ?? Number.NEGATIVE_INFINITY) < 0) {
    return false;
  }

  if (seed?.mode === 'strict-original') {
    return Boolean(
      candidate.features?.isCanonicalOriginal
      || candidate.features?.sameArtist
      || candidate.features?.sameAlbum
      || ((candidate.features?.durationDeltaRatio ?? 1) <= 0.2)
    );
  }

  return true;
}

function computeSessionVarietyHash(value) {
  let hash = 0;
  const input = String(value ?? '');

  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function serializeAutoplayFallbackCandidate(track) {
  if (!track?.playbackInput) {
    return null;
  }

  const { autoplayFallbackCandidates, ...metadata } = track.metadata ?? {};

  return {
    title: track.title,
    artist: track.artist,
    durationMs: track.durationMs ?? null,
    playbackInput: track.playbackInput,
    sourceType: track.sourceType ?? null,
    metadata,
  };
}

async function searchSameArtistSpotifyTracks(seedTrack) {
  const queries = buildSameArtistSpotifyQueries(seedTrack);
  const seen = new Set();
  const combined = [];
  const sourceName = seedTrack?.providerSourceType ?? getSeedProviderSourceName(seedTrack);
  const perQueryLimit = sourceName === 'spotify' ? 6 : 4;
  const maxCandidates = sourceName === 'spotify' ? 6 : 4;

  for (const query of queries) {
    const results = await searchSpotifyTracks(query, perQueryLimit).catch(() => []);
    for (const result of results ?? []) {
      const key = String(result?.spotifyUri ?? '').trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      combined.push(result);
    }

    if (combined.length >= maxCandidates) {
      break;
    }
  }

  return combined
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, maxCandidates);
}

function getAutoplaySearchSources(seed) {
  if (seed?.sourceType === 'text') {
    return lavalinkResolver.getDefaultTextSearchSources({ mode: seed.mode });
  }

  switch (seed?.providerSourceType ?? getSeedProviderSourceName(seed?.track ?? seed)) {
    case 'soundcloud':
      return ['soundcloud', 'youtube_music', 'youtube'];
    case 'deezer':
      return ['deezer', 'youtube_music', 'youtube'];
    case 'spotify':
      return ['youtube_music', 'youtube'];
    case 'youtube_music':
      return ['youtube_music', 'youtube'];
    case 'youtube':
    default:
      return ['youtube_music', 'youtube'];
  }
}

function getSearchLimitForSource(source) {
  switch (source) {
    case 'soundcloud':
    case 'deezer':
      return 8;
    default:
      return 10;
  }
}

function getSearchProvenanceSource(source) {
  switch (source) {
    case 'soundcloud':
      return 'soundcloud-search';
    case 'deezer':
      return 'deezer-search';
    case 'spotify':
      return 'spotify-search';
    case 'youtube_music':
      return 'ytm-search';
    case 'youtube':
    default:
      return 'yt-search';
  }
}

function buildSameArtistSpotifyQueries(seedTrack) {
  const artist = String(seedTrack?.artist ?? '').trim();
  const album = String(getTrackAlbum(seedTrack) ?? '').trim();
  const title = String(seedTrack?.title ?? '').trim();
  const sourceName = seedTrack?.providerSourceType ?? getSeedProviderSourceName(seedTrack);
  const strictOriginalFallback = seedTrack?.mode === 'strict-original';
  const queries = [];

  if (title) {
    queries.push(`artist:${artist} ${title}`);
  }

  if (strictOriginalFallback) {
    if (album && normalizeTitle(album) !== normalizeTitle(title)) {
      queries.push(`artist:${artist} ${album}`);
      queries.push(`${artist} ${album}`);
    }
  } else {
    queries.push(`artist:${artist}`);
    queries.push(artist);

    if (sourceName === 'spotify') {
      queries.push(`"${artist}"`);
    }
  }

  if (!strictOriginalFallback && sourceName === 'spotify' && album && normalizeTitle(album) !== normalizeTitle(title)) {
    queries.push(`artist:${artist} ${album}`);
    queries.push(`${artist} ${album}`);
  }

  return [...new Set(queries.filter(Boolean))];
}

function buildSameArtistProviderQueries(seedTrack, providerSource) {
  const artist = String(seedTrack?.artist ?? '').trim();
  const album = String(getTrackAlbum(seedTrack) ?? '').trim();
  const title = String(seedTrack?.title ?? '').trim();
  const queries = [
    `${artist} ${title}`.trim(),
    artist,
  ];

  if (providerSource === 'deezer' && album && normalizeTitle(album) !== normalizeTitle(title)) {
    queries.push(`${artist} ${album}`);
  }

  return [...new Set(queries.filter(Boolean))];
}

function scoreCandidate(candidate, seed, context = {}, provenance = {}, extraReliability = 0) {
  const seedTitle = normalizeTitle(seed.title);
  const seedArtist = normalizeArtist(seed.artist);
  const seedAlbum = normalizeTitle(seed.album);
  const candidateTitle = normalizeTitle(candidate?.title);
  const candidateArtist = normalizeArtist(candidate?.artist);
  const candidateAlbum = normalizeTitle(getTrackAlbum(candidate));
  const candidateSource = provenance?.source ?? getSeedProviderSourceName(candidate);
  const candidateProvider = getSeedProviderSourceName(candidate);
  const candidateBlob = `${candidateTitle} ${candidateArtist}`.trim();
  const recentArtistSet = context.recentArtistSet ?? new Set();
  const seedTitleTokens = uniqueTitleTokens(seed.title);
  const candidateTitleTokens = uniqueTitleTokens(candidate?.title);
  const overlappingTitleTokens = seedTitleTokens.filter((token) => candidateTitleTokens.includes(token));

  const breakdown = {
    mode: 0,
    originality: 0,
    similarity: 0,
    diversity: 0,
    reliability: extraReliability,
    total: 0
  };

  breakdown.mode += getModeScore(seed.mode, {
    candidateArtist,
    candidateSource,
    recentArtistSet,
    seedSource: seed.sourceType,
    seedArtist,
    sameArtist: candidateArtist === seedArtist,
    sameAlbum: seedAlbum && candidateAlbum && candidateAlbum === seedAlbum,
    isCanonicalOriginal: isCanonicalOriginalTrack(candidate)
  }, context);

  if (seedArtist && candidateArtist && candidateArtist === seedArtist) {
    breakdown.mode += getSameArtistAffinityScore(seed.mode, context.sameArtistStreak, seed.sourceType);
  } else if (candidateArtist && !recentArtistSet.has(candidateArtist)) {
    breakdown.diversity += 12;
  } else if (candidateArtist) {
    breakdown.diversity += 3;
  }

  if (seedArtist && candidateBlob.includes(seedArtist) && candidateArtist !== seedArtist) {
    breakdown.similarity += 12;
  }

  if (seedAlbum && candidateAlbum && candidateAlbum === seedAlbum) {
    breakdown.similarity += 18;
  }

  if (candidateProvider === 'spotify') {
    breakdown.reliability += 12;
  } else if (candidateProvider === 'deezer') {
    breakdown.reliability += 8;
  } else if (candidateProvider === 'soundcloud') {
    breakdown.reliability += 6;
  } else if (candidateProvider === 'youtube_music') {
    breakdown.reliability += 5;
  } else if (candidateProvider === 'youtube') {
    breakdown.reliability += 2;
  }

  if (isCanonicalOriginalTrack(candidate)) {
    breakdown.originality += candidateArtist === seedArtist ? 18 : 8;
  }

  if (isUnwantedVariant(candidate, seed.track)) {
    breakdown.originality -= 90;
  }

  if (overlappingTitleTokens.length > 0) {
    breakdown.similarity -= overlappingTitleTokens.length * (candidateArtist === seedArtist ? 8 : 16);
  }

  if (seedTitle && candidateTitle.includes(seedTitle)) {
    breakdown.similarity -= 28;
  }

  if (seedTitle && candidateTitle === seedTitle) {
    breakdown.similarity -= 35;
  }

  if (hasTitleCling(candidate, seed.track)) {
    breakdown.originality -= 70;
  }

  for (const pattern of GENERIC_RESULT_PATTERNS) {
    if (pattern.test(candidate.title ?? '')) {
      breakdown.originality -= 25;
    }
  }

  if ((candidate.title ?? '').length > 90) {
    breakdown.originality -= 8;
  }

  if (candidate?.durationMs && seed.durationMs) {
    const diffRatio = Math.abs(candidate.durationMs - seed.durationMs) / Math.max(seed.durationMs, 1);
    if (diffRatio <= 0.12) {
      breakdown.similarity += 10;
    } else if (diffRatio <= 0.25) {
      breakdown.similarity += 6;
    } else if (diffRatio >= 0.5) {
      breakdown.similarity -= 8;
    }
  }

  breakdown.total = Object.entries(breakdown)
    .filter(([key]) => key !== 'total')
    .reduce((sum, [, value]) => sum + value, 0);

  return breakdown;
}

function calculateDurationDeltaRatio(candidate, seedTrack) {
  if (!candidate?.durationMs || !seedTrack?.durationMs) {
    return null;
  }

  return Math.abs(candidate.durationMs - seedTrack.durationMs) / Math.max(seedTrack.durationMs, 1);
}

function calculateTitleOverlap(candidate, seedTrack) {
  const seedTitleTokens = uniqueTitleTokens(seedTrack?.title);
  const candidateTitleTokens = uniqueTitleTokens(candidate?.title);
  return seedTitleTokens.filter((token) => candidateTitleTokens.includes(token)).length;
}

function isSpotifyTrackId(value) {
  return /^[A-Za-z0-9]{22}$/.test(String(value ?? '').trim());
}

function getSameArtistLimit(seed) {
  switch (seed?.mode) {
    case 'strict-original':
      return 1;
    case 'discovery':
      return 0;
    case 'radio':
      return 2;
    default:
      return 1;
  }
}

function isRecoveredUrlFallbackSeed(seed) {
  const resolvedBy = String(seed?.track?.metadata?.resolvedBy ?? '').trim().toLowerCase();
  if (resolvedBy.endsWith(':url-fallback')) {
    return true;
  }

  return Boolean(seed?.track?.metadata?.originalUrl);
}

function shouldPreferNativeFirst(seed, sourceName) {
  if (seed?.mode === 'discovery' || seed?.mode === 'radio') {
    return true;
  }

  if (seed?.mode === 'strict-original') {
    return sourceName === 'youtube' || sourceName === 'youtube_music';
  }

  return false;
}

function shouldDeferSameArtistCatalog(seed, sourceName) {
  if (seed?.sourceType === 'text') {
    return true;
  }

  return seed?.mode === 'strict-original' && sourceName === 'spotify';
}

function getModeScore(mode, details, context) {
  const source = details.candidateSource;
  const sameArtist = details.sameArtist;
  const sameAlbum = details.sameAlbum;
  const canonical = details.isCanonicalOriginal;
  const seedSource = details.seedSource;
  const freshArtist = details.candidateArtist && !details.recentArtistSet.has(details.candidateArtist);
  const isCatalogSearch = source === 'spotify-search'
    || source === 'deezer-search'
    || source === 'soundcloud-search'
    || source === 'ytm-search'
    || source === 'yt-search';
  const isProviderCatalogSearch = source === 'spotify-search'
    || source === 'deezer-search'
    || source === 'soundcloud-search';
  const isYouTubeSeed = seedSource === 'youtube' || seedSource === 'youtube_music';
  const isTextSeed = seedSource === 'text';

  switch (mode) {
    case 'strict-original': {
      let score = 0;
      if (canonical) score += 24;
      if (sameArtist) score += (isYouTubeSeed || isTextSeed) ? 2 : 8;
      if (sameAlbum) score += 8;
      if (isCatalogSearch) score += isYouTubeSeed ? 4 : 10;
      if (source === 'native-rec') score -= 8;
      if (source === 'yt-related' && !isYouTubeSeed) score -= 8;
      return score;
    }
    case 'discovery': {
      let score = 0;
      if (sameArtist) score -= 12;
      if (freshArtist) score += 18;
      if (canonical) score += 12;
      if (source === 'native-rec' || source === 'yt-related') score -= 10;
      if (context.sameArtistStreak >= 1 && sameArtist) score -= 10;
      return score;
    }
    case 'radio': {
      let score = 0;
      if (source === 'native-rec' || source === 'yt-related') score += 40;
      if (!sameArtist && freshArtist) score += 10;
      if (sameArtist) score -= 20;
      return score;
    }
    case 'artist-continuity':
    default: {
      let score = 0;
      if (sameArtist) score += 18;
      if (sameAlbum) score += 8;
      if (isProviderCatalogSearch) score += 20;
      if (source === 'yt-related' || source === 'native-rec') score -= 4;
      return score;
    }
  }
}

function getSameArtistAffinityScore(mode, sameArtistStreak = 0, seedSourceType = null) {
  switch (mode) {
    case 'strict-original':
      if (seedSourceType === 'text') {
        return sameArtistStreak >= 1 ? 0 : 3;
      }
      return sameArtistStreak >= 1 ? 2 : 8;
    case 'artist-continuity':
      return sameArtistStreak >= 1 ? 8 : 28;
    case 'radio':
      return sameArtistStreak >= 1 ? -4 : 4;
    case 'discovery':
      return sameArtistStreak >= 1 ? -8 : 0;
    default:
      return sameArtistStreak >= 1 ? 8 : 20;
  }
}

function passesStrictOriginalSignalFloor(seed, features = {}, scoreBreakdown = {}, provenance = {}) {
  const hasCoreSignal = Boolean(
    features.sameArtist
    || features.sameAlbum
    || features.isCanonicalOriginal
  );

  const hasStrongRelatedSignal = Boolean(
    (provenance?.source === 'yt-related' || provenance?.source === 'native-rec')
    && (features.durationDeltaRatio ?? Number.POSITIVE_INFINITY) <= 0.12
    && (scoreBreakdown.total ?? Number.NEGATIVE_INFINITY) >= 16
  );

  if (!hasCoreSignal && !hasStrongRelatedSignal) {
    return false;
  }

  const minimumTotal = (hasStrongRelatedSignal || isRecoveredUrlFallbackSeed(seed)) ? 16 : 18;
  return (scoreBreakdown.total ?? Number.NEGATIVE_INFINITY) >= minimumTotal;
}

async function getCanonicalSearchRecommendation(seed, context, cleanTitle, allowTitleOnly = true) {
  if (seed.artist && seed.artist !== 'Unknown Artist' && cleanTitle) {
    const track = await pickFromSearch(`${seed.artist} ${cleanTitle}`, seed, context, 'ytm-search');
    if (track) return track;
  }

  if (seed.artist && seed.artist !== 'Unknown Artist') {
    const track = await pickFromSearch(`${seed.artist} official audio`, seed, context, 'ytm-search');
    if (track) return track;
  }

  if (allowTitleOnly && cleanTitle.length > 3 && !isGenericShortTitle(seed.title)) {
    const track = await pickFromSearch(cleanTitle, seed, context, 'ytm-search');
    if (track) return track;
  }

  if (allowTitleOnly && seed.artist && seed.artist !== 'Unknown Artist' && seed.title) {
    const track = await pickFromSearch(`${seed.artist} ${cleanTitle} audio`, seed, context, 'ytm-search');
    if (track) return track;
  }

  return null;
}

function isSameTrack(candidate, seedTrack) {
  if (!candidate || !seedTrack) return false;

  const candidateTitle = normalizeTitle(candidate.title);
  const seedTitle = normalizeTitle(seedTrack.title);
  const candidateArtist = normalizeArtist(candidate.artist);
  const seedArtist = normalizeArtist(seedTrack.artist);

  if (candidateTitle && seedTitle && candidateTitle === seedTitle) {
    if (!seedArtist || !candidateArtist || candidateArtist === seedArtist) {
      return true;
    }
  }

  const candidateInput = String(candidate.playbackInput ?? candidate.sourceUrl ?? '').trim().toLowerCase();
  const seedInput = String(seedTrack.playbackInput ?? seedTrack.sourceUrl ?? '').trim().toLowerCase();
  return Boolean(candidateInput && seedInput && candidateInput === seedInput);
}

function isGenericShortTitle(value) {
  return uniqueTitleTokens(value).length <= 2;
}
