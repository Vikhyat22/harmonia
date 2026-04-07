const STOP_WORDS = new Set([
  'official',
  'video',
  'audio',
  'lyrics',
  'lyrical',
  'hd',
  'hq',
  '4k',
  'full',
  'song',
  'with',
  'feat',
  'ft',
]);

export function normalizeSourceName(value) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');

  switch (normalized) {
    case 'ytsearch':
    case 'youtube':
      return 'youtube';
    case 'ytmsearch':
    case 'youtube_music':
    case 'youtubemusic':
      return 'youtube_music';
    case 'scsearch':
    case 'soundcloud':
      return 'soundcloud';
    case 'dzsearch':
    case 'deezer':
      return 'deezer';
    case 'spsearch':
    case 'sprec':
    case 'spotify':
      return 'spotify';
    case 'local':
      return 'local';
    default:
      return normalized || null;
  }
}

export function normalizeTitle(value) {
  return String(value ?? '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/official|video|audio|lyrics|lyrical|hd|hq|4k/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeArtist(value) {
  return String(value ?? '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\s*-\s*topic\b/gi, ' ')
    .replace(/\btopic\b/gi, ' ')
    .replace(/\bvevo\b/gi, ' ')
    .replace(/\s+(?:feat|ft)\.?\s+.*$/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenizeTitle(value) {
  return normalizeTitle(value)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function uniqueTitleTokens(value) {
  return [...new Set(tokenizeTitle(value))];
}

function normalizeUrlForKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    url.hash = '';

    if ((url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com') && url.searchParams.has('v')) {
      return `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
    }

    if (url.hostname === 'youtu.be') {
      return `https://www.youtube.com/watch?v=${url.pathname.replace(/^\//, '')}`;
    }

    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return raw.toLowerCase();
  }
}

export function buildCanonicalKey(track) {
  const spotifyTrackId = String(
    track?.metadata?.spotifyTrackId
    ?? ''
  ).trim();
  if (spotifyTrackId) {
    return `spotify:${spotifyTrackId}`;
  }

  const youtubeId = String(
    track?.metadata?.identifier
    ?? track?.metadata?.lavalinkTrack?.info?.identifier
    ?? ''
  ).trim();
  if (youtubeId) {
    const sourceName = normalizeSourceName(
      track?.metadata?.canonicalSourceType
      ?? track?.metadata?.sourceName
      ?? track?.metadata?.lavalinkTrack?.info?.sourceName
      ?? track?.sourceType
    );
    const sourcePrefix = sourceName === 'youtube_music'
      ? 'youtube'
      : sourceName;

    if (sourcePrefix === 'youtube' || sourcePrefix === 'soundcloud' || sourcePrefix === 'deezer') {
      return `${sourcePrefix}:${youtubeId}`;
    }
  }

  const canonicalUrl = normalizeUrlForKey(
    track?.metadata?.canonicalUrl
    ?? track?.metadata?.spotifyUri
    ?? track?.playbackInput
    ?? track?.sourceUrl
  );
  if (canonicalUrl) {
    return `canonical-url:${canonicalUrl}`;
  }

  return `fallback:${normalizeArtist(track?.artist)}|${normalizeTitle(track?.title)}`;
}
