const SPOTIFY_URI_REGEX = /^spotify:(track|album|playlist):([A-Za-z0-9]+)$/i;

const SHORT_URL_HOSTS = new Set([
  'spotify.link',
  'on.soundcloud.com',
  'deezer.page.link',
  'link.deezer.com'
]);

export function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function detectMediaSource(input) {
  const value = String(input ?? '').trim();
  if (!value) {
    return null;
  }

  const spotifyUriMatch = value.match(SPOTIFY_URI_REGEX);
  if (spotifyUriMatch) {
    return 'spotify';
  }

  if (!isHttpUrl(value)) {
    return null;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();

    if (
      host === 'youtu.be'
      || host.endsWith('youtube.com')
      || host.endsWith('music.youtube.com')
      || host.endsWith('m.youtube.com')
    ) {
      return 'youtube';
    }

    if (host.includes('spotify.com') || host === 'spotify.link') {
      return 'spotify';
    }

    if (host.includes('soundcloud.com') || host === 'on.soundcloud.com') {
      return 'soundcloud';
    }

    if (host.includes('deezer.com') || host === 'deezer.page.link' || host === 'link.deezer.com') {
      return 'deezer';
    }

    return null;
  } catch {
    return null;
  }
}

export function isSpotifyTrackUrl(value) {
  const spotifyUriMatch = String(value ?? '').trim().match(SPOTIFY_URI_REGEX);
  if (spotifyUriMatch) {
    return spotifyUriMatch[1].toLowerCase() === 'track';
  }

  try {
    const url = new URL(value);
    return (url.hostname.toLowerCase().includes('spotify.com') || url.hostname.toLowerCase() === 'spotify.link')
      && /\/track\//i.test(url.pathname);
  } catch {
    return false;
  }
}

export async function normalizeMediaInput(input, { fetchImpl = global.fetch } = {}) {
  const value = String(input ?? '').trim();
  if (!value) {
    return value;
  }

  const spotifyUriMatch = value.match(SPOTIFY_URI_REGEX);
  if (spotifyUriMatch) {
    const [, type, id] = spotifyUriMatch;
    return `https://open.spotify.com/${type.toLowerCase()}/${id}`;
  }

  if (!isHttpUrl(value)) {
    return value;
  }

  try {
    let url = new URL(value);

    if (SHORT_URL_HOSTS.has(url.hostname.toLowerCase())) {
      url = await expandKnownShortUrl(url, fetchImpl);
    }

    const host = url.hostname.toLowerCase();
    if (
      host === 'youtu.be'
      || host.endsWith('youtube.com')
      || host.endsWith('music.youtube.com')
      || host.endsWith('m.youtube.com')
    ) {
      return normalizeYouTubeUrl(url);
    }

    return url.toString();
  } catch {
    return value;
  }
}

export async function isPlaylistMediaUrl(input, options = {}) {
  const normalized = await normalizeMediaInput(input, options);
  if (!isHttpUrl(normalized)) {
    return false;
  }

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();

    if (host.includes('youtube.com') && url.searchParams.has('list') && !url.searchParams.has('v')) {
      return true;
    }

    if (host.includes('spotify.com') && (url.pathname.includes('/playlist/') || url.pathname.includes('/album/'))) {
      return true;
    }

    if (host.includes('soundcloud.com') && url.pathname.includes('/sets/')) {
      return true;
    }

    if (host.includes('deezer.com') && (url.pathname.includes('/playlist/') || url.pathname.includes('/album/'))) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function expandKnownShortUrl(url, fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    return url;
  }

  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await fetchImpl(url.toString(), {
        method,
        redirect: 'follow'
      });

      if (response?.url && isHttpUrl(response.url)) {
        return new URL(response.url);
      }
    } catch {
      // Try the next method before giving up.
    }
  }

  return url;
}

function normalizeYouTubeUrl(url) {
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname;

  let videoId = null;
  let playlistId = url.searchParams.get('list');

  if (host === 'youtu.be') {
    videoId = pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (pathname.startsWith('/watch')) {
    videoId = url.searchParams.get('v');
  } else if (pathname.startsWith('/shorts/')) {
    videoId = pathname.split('/')[2] ?? null;
  } else if (pathname.startsWith('/embed/')) {
    videoId = pathname.split('/')[2] ?? null;
  } else if (pathname.startsWith('/live/')) {
    videoId = pathname.split('/')[2] ?? null;
  } else if (pathname.startsWith('/playlist')) {
    videoId = null;
  }

  if (videoId) {
    const normalized = new URL('https://www.youtube.com/watch');
    normalized.searchParams.set('v', videoId);
    if (playlistId) {
      normalized.searchParams.set('list', playlistId);
    }
    return normalized.toString();
  }

  if (playlistId) {
    const normalized = new URL('https://www.youtube.com/playlist');
    normalized.searchParams.set('list', playlistId);
    return normalized.toString();
  }

  return url.toString();
}
