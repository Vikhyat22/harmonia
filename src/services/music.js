function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const UNSUPPORTED_PAGE_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'spotify.com',
  'open.spotify.com',
  'spotify.link',
  'soundcloud.com',
  'www.soundcloud.com'
];

const DIRECT_AUDIO_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.ogg',
  '.opus',
  '.flac',
  '.webm',
  '.mp4',
  '.m3u8',
  '.pls'
];

function formatTitleFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const lastSegment = url.pathname.split('/').filter(Boolean).at(-1);
    if (!lastSegment) {
      return url.hostname;
    }

    return decodeURIComponent(lastSegment)
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim() || url.hostname;
  } catch {
    return 'Unknown audio source';
  }
}

function isUnsupportedPageHost(url) {
  const host = url.hostname.toLowerCase();
  return UNSUPPORTED_PAGE_HOSTS.includes(host);
}

function looksLikeDirectPlayableUrl(url) {
  const pathname = url.pathname.toLowerCase();
  return DIRECT_AUDIO_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

export function resolveMusicRequest(query, explicitTitle) {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Please provide a music URL or query.');
  }

  if (!isHttpUrl(trimmed)) {
    throw new Error(
      'Phase 1 music currently supports direct audio or stream URLs only. Query search and autoplay recommendations are next.'
    );
  }

  const url = new URL(trimmed);
  if (isUnsupportedPageHost(url)) {
    throw new Error(
      'Phase 1 music does not support YouTube, Spotify, or SoundCloud page links yet. Use a direct audio or stream URL instead.'
    );
  }

  if (!looksLikeDirectPlayableUrl(url)) {
    throw new Error(
      'Phase 1 music only supports direct audio or stream URLs like .mp3, .m4a, .ogg, or .m3u8 links.'
    );
  }

  return {
    sourceUrl: trimmed,
    title: explicitTitle?.trim() || formatTitleFromUrl(trimmed)
  };
}
