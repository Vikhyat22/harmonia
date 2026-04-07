const LYRICS_API_BASE = 'https://api.lyrics.ovh';
const REQUEST_TIMEOUT_MS = 7_000;
const TITLE_NOISE_PATTERN = /\b(official|video|audio|lyrics?|lyrical|full song|full video|hd|hq|4k)\b/gi;
const ARTIST_SUFFIX_PATTERN = /\s*-\s*topic\b/gi;
const EMBED_CHUNK_LIMIT = 3500;

function safeAbortSignal(timeoutMs = REQUEST_TIMEOUT_MS) {
  if (typeof AbortSignal?.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  return undefined;
}

function collapseWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLyricsText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function cleanLyricsArtist(value) {
  return collapseWhitespace(
    String(value ?? '')
      .replace(ARTIST_SUFFIX_PATTERN, ' ')
      .replace(/\btopic\b/gi, ' ')
      .replace(/\bvevo\b/gi, ' ')
      .replace(/\s+(?:feat|ft)\.?\s+.*$/gi, ' ')
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
  );
}

export function cleanLyricsTitle(value) {
  let cleaned = String(value ?? '')
    .replace(/\(from\s+["'][^"']+["']\)/gi, ' ')
    .replace(/\(.*?version.*?\)/gi, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(TITLE_NOISE_PATTERN, ' ')
    .replace(/\|.*$/g, ' ')
    .replace(/\s*-\s*[^-]*topic\b/gi, ' ');

  const separators = [' | ', ' - ', ': '];
  for (const separator of separators) {
    const parts = cleaned.split(separator).map((part) => collapseWhitespace(part)).filter(Boolean);
    if (parts.length > 1) {
      cleaned = parts[0];
      break;
    }
  }

  return collapseWhitespace(cleaned);
}

export function parseLyricsQuery(query) {
  const raw = collapseWhitespace(query);
  if (!raw) {
    return { title: null, artist: null, query: '' };
  }

  for (const separator of [' by ', ' - ', ' | ']) {
    const parts = raw.split(separator);
    if (parts.length === 2) {
      const [first, second] = parts.map((part) => collapseWhitespace(part));

      if (separator === ' by ') {
        return {
          title: cleanLyricsTitle(first),
          artist: cleanLyricsArtist(second),
          query: raw
        };
      }

      return {
        artist: cleanLyricsArtist(first),
        title: cleanLyricsTitle(second),
        query: raw
      };
    }
  }

  return {
    title: cleanLyricsTitle(raw),
    artist: null,
    query: raw
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    },
    signal: safeAbortSignal()
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Lyrics API returned ${response.status}.`);
  }

  return response.json();
}

function buildLookupVariants({ title, artist }) {
  const variants = [];
  const titleVariants = [
    cleanLyricsTitle(title),
    collapseWhitespace(String(title ?? '').replace(/\(.*?\)|\[.*?\]/g, ' ')),
    collapseWhitespace(title)
  ].filter(Boolean);
  const artistVariants = [
    cleanLyricsArtist(artist),
    collapseWhitespace(artist)
  ].filter(Boolean);

  if (artistVariants.length === 0) {
    return titleVariants.map((variantTitle) => ({
      title: variantTitle,
      artist: null
    }));
  }

  for (const variantArtist of artistVariants) {
    for (const variantTitle of titleVariants) {
      const duplicate = variants.some((entry) => entry.artist === variantArtist && entry.title === variantTitle);
      if (!duplicate) {
        variants.push({
          artist: variantArtist,
          title: variantTitle
        });
      }
    }
  }

  return variants;
}

async function fetchLyricsByArtistAndTitle(artist, title) {
  if (!artist || !title) {
    return null;
  }

  const endpoint = `${LYRICS_API_BASE}/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  const payload = await fetchJson(endpoint);
  const lyrics = normalizeLyricsText(payload?.lyrics);

  if (!lyrics) {
    return null;
  }

  return {
    title,
    artist,
    lyrics
  };
}

async function fetchLyricsFromSuggestion(query) {
  const endpoint = `${LYRICS_API_BASE}/suggest/${encodeURIComponent(query)}`;
  const payload = await fetchJson(endpoint);
  const candidates = Array.isArray(payload?.data) ? payload.data : [];

  for (const candidate of candidates.slice(0, 5)) {
    const artist = cleanLyricsArtist(candidate?.artist?.name ?? '');
    const title = cleanLyricsTitle(candidate?.title ?? '');
    const result = await fetchLyricsByArtistAndTitle(artist, title);
    if (result) {
      return result;
    }
  }

  return null;
}

export async function fetchLyrics({ title, artist, query } = {}) {
  const normalizedTitle = cleanLyricsTitle(title ?? '');
  const normalizedArtist = cleanLyricsArtist(artist ?? '');
  const normalizedQuery = collapseWhitespace(query ?? '');

  const variants = buildLookupVariants({
    title: normalizedTitle || normalizedQuery,
    artist: normalizedArtist
  });

  for (const variant of variants) {
    const result = await fetchLyricsByArtistAndTitle(variant.artist, variant.title);
    if (result) {
      return result;
    }
  }

  const fallbackQuery = normalizedQuery || [normalizedArtist, normalizedTitle].filter(Boolean).join(' ');
  if (!fallbackQuery) {
    return null;
  }

  return fetchLyricsFromSuggestion(fallbackQuery);
}

export function chunkLyricsForEmbeds(lyrics, maxChunkLength = EMBED_CHUNK_LIMIT) {
  const text = String(lyrics ?? '').trim();
  if (!text) {
    return [];
  }

  if (text.length <= maxChunkLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxChunkLength) {
    let splitIndex = remaining.lastIndexOf('\n\n', maxChunkLength);
    if (splitIndex < Math.floor(maxChunkLength * 0.6)) {
      splitIndex = remaining.lastIndexOf('\n', maxChunkLength);
    }
    if (splitIndex < Math.floor(maxChunkLength * 0.5)) {
      splitIndex = remaining.lastIndexOf(' ', maxChunkLength);
    }
    if (splitIndex <= 0) {
      splitIndex = maxChunkLength;
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}
