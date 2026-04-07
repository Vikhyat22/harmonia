// Spotify Recommendations via Client Credentials flow.
// Calls /v1/recommendations with a seed track to get acoustically similar songs.

let tokenCache = null; // { access_token, expires_at, client_id, client_secret }

async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (
    tokenCache
    && tokenCache.client_id === clientId
    && tokenCache.client_secret === clientSecret
    && Date.now() < tokenCache.expires_at
  ) {
    return tokenCache.access_token;
  }

  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  tokenCache = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
    client_id: clientId,
    client_secret: clientSecret,
  };
  return tokenCache.access_token;
}

/**
 * Returns up to `limit` recommended tracks seeded by a Spotify track ID.
 * Each result: { title, artist, spotifyUri }
 */
export async function getSpotifyRecommendations(seedTrackId, limit = 5) {
  try {
    const token = await getAccessToken();
    if (!token) return [];

    const url = `https://api.spotify.com/v1/recommendations?seed_tracks=${encodeURIComponent(seedTrackId)}&limit=${limit}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return [];

    const data = await resp.json();
    return (data.tracks ?? []).map((t) => ({
      title: t.name,
      artist: t.artists?.[0]?.name ?? 'Unknown Artist',
      spotifyUri: t.uri, // e.g. spotify:track:XXXXX
    }));
  } catch {
    return [];
  }
}

/**
 * Returns up to `limit` Spotify search matches for a text query.
 * Each result: { title, artist, spotifyUri, popularity }
 */
export async function searchSpotifyTracks(query, limit = 5) {
  try {
    const token = await getAccessToken();
    if (!token) return [];

    const url = `https://api.spotify.com/v1/search?type=track&limit=${limit}&q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return [];

    const data = await resp.json();
    return (data.tracks?.items ?? []).map((track) => ({
      title: track.name,
      artist: track.artists?.[0]?.name ?? 'Unknown Artist',
      spotifyUri: track.uri,
      popularity: track.popularity ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function getSpotifyTrackDetails(trackId) {
  try {
    const token = await getAccessToken();
    if (!token || !trackId) return null;

    const url = `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return null;

    const track = await resp.json();
    const artists = (track.artists ?? [])
      .map((artist) => artist?.name ?? null)
      .filter(Boolean);

    return {
      title: track.name ?? null,
      artist: artists[0] ?? null,
      artists,
      durationMs: track.duration_ms ?? null,
      spotifyUri: track.uri ?? spotifyTrackIdToWebUrl(trackId),
      isrc: track.external_ids?.isrc ?? null,
      album: track.album?.name ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Extracts a Spotify track ID from either:
 *   https://open.spotify.com/track/XXXXX
 *   spotify:track:XXXXX
 */
export function extractSpotifyTrackId(uri) {
  if (!uri) return null;
  const urlMatch = uri.match(/(?:open\.)?spotify\.com\/track\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  const uriMatch = uri.match(/^spotify:track:([a-zA-Z0-9]+)$/);
  if (uriMatch) return uriMatch[1];
  return null;
}

export function spotifyTrackIdToWebUrl(trackId) {
  return trackId ? `https://open.spotify.com/track/${trackId}` : null;
}

export function spotifyUriToWebUrl(uri) {
  return spotifyTrackIdToWebUrl(extractSpotifyTrackId(uri));
}
