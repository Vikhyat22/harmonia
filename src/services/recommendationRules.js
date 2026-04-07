import {
  normalizeArtist,
  normalizeTitle,
  uniqueTitleTokens
} from './recommendationIdentity.js';

export const GENERIC_RESULT_PATTERNS = [
  /\bhits?\b/i,
  /\bbest\b/i,
  /\blatest\b/i,
  /\bplaylist\b/i,
  /\bjukebox\b/i,
  /\bnon[- ]?stop\b/i,
  /\bmega ?mix\b/i,
  /\bmashup\b/i,
  /\bcompilation\b/i,
  /\bfull album\b/i,
  /\ball songs\b/i,
  /\bvideo songs?\b/i,
  /\blyrics?\b/i,
  /\blyrical\b/i,
  /\bslowed\b/i,
  /\breverb\b/i,
  /\bremix\b/i,
  /\bdj\b/i,
];

export const COMPILATION_TITLE_PATTERNS = [
  /\btop\s+\d+\b/i,
  /\bbest\s+of\b/i,
  /\bbest\s+songs?\b/i,
];

export const NON_CANONICAL_PRESENTATION_PATTERNS = [
  /\breacts?\s+to\b/i,
  /\breaction\b/i,
  /\bbehind\s+the\s+scenes\b/i,
  /\bmaking\s+of\b/i,
  /\bfirst\s+time\s+hearing\b/i,
  /\breview\b/i,
];

export const VARIANT_RESULT_PATTERNS = [
  /\bedit(?:ed)?\b/i,
  /\bmashup\b/i,
  /\bbreakbeat\b/i,
  /\btechno\b/i,
  /\bduet\b/i,
  /\bversion\b/i,
  /\bremix\b/i,
  /\blive\b/i,
  /\bacoustic\b/i,
  /\bcover\b/i,
  /\binstrumental\b/i,
  /\bkaraoke\b/i,
  /\blyrics?\b/i,
  /\blyrical\b/i,
  /\blo[- ]?fi\b/i,
  /\bsped ?up\b/i,
  /\bslowed\b/i,
  /\breverb\b/i,
  /\brehearsal\b/i,
  /\bbackstage\b/i,
  /\bbehind\s+the\s+scenes?\b/i,
  /\breact(?:s|ion|ing)?\b/i,
  /\bcoreografia\b/i,
  /\bchoreograph(?:y|ed)?\b/i,
  /\bfor cello\b/i,
  /\bfor piano\b/i,
  /\bcello and piano\b/i,
  /\bsymphony\b/i,
  /\bdj\b/i,
];

export const CANONICAL_TITLE_PATTERNS = [
  /\bofficial music video\b/i,
  /\bofficial video\b/i,
  /\bofficial audio\b/i,
  /\bsoundtrack\b/i,
  /\bost\b/i,
  /\bfrom\s+["'][^"']+["']/i,
];

export const TOPIC_CHANNEL_PATTERN = /\btopic\b/i;
const OFFICIAL_UPLOADER_PATTERN = /\b(official|music|records?|series|studio|films?|entertainment|label|kalamkaar|t-?series|saregama|lahari|tips|sony|zee|universal|coke studio)\b/i;

export function buildSongFamilyKey(value, artist = null) {
  let normalized = String(value ?? '').toLowerCase();
  const artistKey = normalizeArtist(artist);

  if (artistKey) {
    const artistPattern = new RegExp(`^${escapeRegExp(artistKey).replace(/\s+/g, '\\s+')}(?:\\s*[-:|]\\s*|\\s+)`, 'i');
    normalized = normalized.replace(artistPattern, '');
  }

  normalized = stripLeadingTitlePrefix(normalized);
  normalized = normalized.replace(/\(.*?\)|\[.*?\]/g, ' ');
  for (const pattern of VARIANT_RESULT_PATTERNS) {
    normalized = normalized.replace(pattern, ' ');
  }
  normalized = normalized
    .replace(/\bfeat\.?\b/gi, ' ')
    .replace(/\bft\.?\b/gi, ' ')
    .replace(/\bofficial\b/gi, ' ')
    .replace(/\bvideo\b/gi, ' ')
    .replace(/\baudio\b/gi, ' ')
    .replace(/\blyrics?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip secondary attribution suffix ("| Coke Studio Bharat", "| T-Series", etc.)
  const pipeIndex = normalized.indexOf(' | ');
  if (pipeIndex >= 0) {
    normalized = normalized.slice(0, pipeIndex).trim();
  }

  const tokens = normalized
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);

  return tokens.slice(0, 4).join(' ');
}

export const buildSongSignature = buildSongFamilyKey;

export function isGenericResultTitle(value) {
  return GENERIC_RESULT_PATTERNS.some((pattern) => pattern.test(value ?? ''));
}

export function isVariantTitle(value) {
  return VARIANT_RESULT_PATTERNS.some((pattern) => pattern.test(value ?? ''));
}

export function isCanonicalOriginalTrack(track) {
  const artist = String(track?.artist ?? '').trim();
  const title = String(track?.title ?? '').trim();
  const hasCanonicalTitle = CANONICAL_TITLE_PATTERNS.some((pattern) => pattern.test(title));
  const hasOfficialUploader = OFFICIAL_UPLOADER_PATTERN.test(artist);
  const sourceName = String(
    track?.metadata?.canonicalSourceType
    ?? track?.metadata?.sourceName
    ?? track?.sourceType
    ?? ''
  ).trim().toLowerCase();

  if (TOPIC_CHANNEL_PATTERN.test(artist)) {
    return true;
  }

  if (NON_CANONICAL_PRESENTATION_PATTERNS.some((pattern) => pattern.test(title))) {
    return false;
  }

  if (!hasCanonicalTitle) {
    return false;
  }

  if (sourceName === 'youtube_music') {
    return true;
  }

  if (titleHasUploaderMismatch(title, artist) && !hasOfficialUploader) {
    return false;
  }

  if (hasOfficialUploader) {
    return true;
  }

  return titlePrefixMatchesArtist(title, artist);
}

export function isUnwantedVariant(track, seedTrack) {
  const title = track?.title ?? '';
  if (
    COMPILATION_TITLE_PATTERNS.some((pattern) => pattern.test(title))
    || NON_CANONICAL_PRESENTATION_PATTERNS.some((pattern) => pattern.test(title))
  ) {
    return true;
  }
  return !isVariantTitle(seedTrack?.title) && isVariantTitle(track?.title);
}

export function isSameSongFamily(candidate, seedTrack) {
  const candidateSignature = buildSongFamilyKey(candidate?.title, candidate?.artist);
  const seedSignature = buildSongFamilyKey(seedTrack?.title, seedTrack?.artist);
  return Boolean(candidateSignature && seedSignature && candidateSignature === seedSignature);
}

export function hasTitleCling(candidate, seedTrack) {
  if (!candidate || !seedTrack) return false;

  const seedTokens = uniqueTitleTokens(seedTrack.title);
  const candidateTokens = uniqueTitleTokens(candidate.title);
  if (seedTokens.length === 0 || candidateTokens.length === 0) {
    return false;
  }

  const overlap = seedTokens.filter((token) => candidateTokens.includes(token));
  if (overlap.length === 0) {
    return false;
  }

  const sameArtist = normalizeArtist(candidate.artist) === normalizeArtist(seedTrack.artist);
  const overlapRatio = overlap.length / seedTokens.length;

  if (seedTokens.length <= 2) {
    return true;
  }

  return !sameArtist && overlapRatio >= 0.5;
}

export function normalizedTrackTitle(value) {
  return normalizeTitle(value);
}

function stripLeadingTitlePrefix(value) {
  const separators = [' - ', ' | ', ': '];

  for (const separator of separators) {
    const parts = value.split(separator);
    if (parts.length < 2) {
      continue;
    }

    const [first, ...rest] = parts;
    const firstTokens = first.trim().split(/[^a-z0-9]+/i).filter(Boolean);
    const remainder = rest.join(separator).trim();
    const remainderTokens = remainder.split(/[^a-z0-9]+/i).filter(Boolean);

    const hasCollabMarker = /\b(x|feat\.?|ft\.?)\b/i.test(first.trim());
    const maxPrefixTokens = hasCollabMarker ? 6 : 4;
    if (firstTokens.length >= 1 && firstTokens.length <= maxPrefixTokens && remainderTokens.length >= 1) {
      return remainder;
    }
  }

  return value;
}

function titleHasUploaderMismatch(title, artist) {
  const separators = [' - ', ' | ', ': '];
  const normalizedArtist = normalizeArtist(artist);
  if (!normalizedArtist) {
    return false;
  }

  for (const separator of separators) {
    const parts = String(title ?? '').split(separator);
    if (parts.length < 2) {
      continue;
    }

    const titlePrefix = normalizeArtist(parts[0]);
    if (!titlePrefix) {
      continue;
    }

    const prefixTokenCount = titlePrefix.split(/\s+/).filter(Boolean).length;
    if (prefixTokenCount === 0 || prefixTokenCount > 4) {
      continue;
    }

    if (titlePrefix === normalizedArtist) {
      return false;
    }

    return true;
  }

  return false;
}

function titlePrefixMatchesArtist(title, artist) {
  const separators = [' - ', ' | ', ': '];
  const normalizedArtist = normalizeArtist(artist);
  if (!normalizedArtist) {
    return false;
  }

  for (const separator of separators) {
    const parts = String(title ?? '').split(separator);
    if (parts.length < 2) {
      continue;
    }

    const titlePrefix = normalizeArtist(parts[0]);
    if (!titlePrefix) {
      continue;
    }

    const prefixTokenCount = titlePrefix.split(/\s+/).filter(Boolean).length;
    if (prefixTokenCount === 0 || prefixTokenCount > 4) {
      continue;
    }

    if (titlePrefix === normalizedArtist) {
      return true;
    }
  }

  return false;
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
