import { getAvailableNode } from './lavalink.js';
import { createMusicTrack } from './track.js';
import {
  normalizeArtist,
  normalizeTitle,
  tokenizeTitle
} from './recommendationIdentity.js';
import { detectMediaSource } from '../utils/mediaUrls.js';
import {
  isCanonicalOriginalTrack,
  isGenericResultTitle,
  isVariantTitle,
  TOPIC_CHANNEL_PATTERN
} from './recommendationRules.js';

const SOURCE_MAP = {
  youtube: 'youtube',
  ytsearch: 'youtube',
  youtube_music: 'youtube_music',
  ytmsearch: 'youtube_music',
  soundcloud: 'soundcloud',
  scsearch: 'soundcloud',
  spotify: 'spotify',
  deezer: 'deezer',
  local: 'local',
};
const DEFAULT_TEXT_SEARCH_SOURCES = ['youtube_music', 'youtube', 'spotify'];
const EXPANDED_TEXT_SEARCH_SOURCES = ['youtube_music', 'youtube', 'spotify', 'soundcloud', 'deezer'];
const MIN_TEXT_MATCH_SCORE = 45;

class LavalinkMusicResolver {
  constructor() {
    this.spotifyPlaylistRegex = /(?:https?:\/\/)?(?:open\.)?spotify\.com\/playlist\/([a-zA-Z0-9]+)/;
  }

  getNode() {
    return getAvailableNode();
  }

  async resolve(query, source) {
    return this.resolveTrack(query, source);
  }

  getDefaultTextSearchSources(context = {}) {
    const baseSources = context?.mode === 'discovery' || context?.mode === 'radio'
      ? EXPANDED_TEXT_SEARCH_SOURCES
      : DEFAULT_TEXT_SEARCH_SOURCES;
    const configured = process.env.MUSIC_TEXT_SEARCH_SOURCES
      ?.split(',')
      .map((value) => normalizeSearchSource(value))
      .filter(Boolean);

    const preferred = normalizeSearchSource(process.env.SEARCH_ENGINE || process.env.LAVALINK_SEARCH_ENGINE);
    const ordered = [];

    if (preferred) {
      ordered.push(preferred);
    }

    for (const source of configured ?? baseSources) {
      if (!ordered.includes(source)) {
        ordered.push(source);
      }
    }

    for (const source of baseSources) {
      if (!ordered.includes(source)) {
        ordered.push(source);
      }
    }

    return ordered;
  }

  async resolveTrack(query, source) {
    try {
      const tracks = await this.searchInternal(query, source);

      if (tracks.length === 0) return null;

      return this.mapLavalinkTrack(tracks[0], source);
    } catch (error) {
      console.error('Error resolving track:', error.message, error.stack);
      return null;
    }
  }

  async resolveTextQuery(query, context = {}) {
    const sources = Array.isArray(context.sources) && context.sources.length > 0
      ? context.sources.map((value) => normalizeSearchSource(value)).filter(Boolean)
      : this.getDefaultTextSearchSources(context);

    for (const source of sources) {
      const results = await this.searchSource(query, source, 5);
      const picked = pickBestTextResult(results, query, source);
      if (!picked) {
        continue;
      }

      return {
        ...picked,
        metadata: {
          ...picked.metadata,
          resolvedBy: `search:${source}`,
          searchQuery: query
        }
      };
    }

    return null;
  }

  async resolvePlaylist(url) {
    try {
      const node = this.getNode();
      if (!node) return [];

      const response = await node.search({ query: url }, null);
      if (!response || response.loadType === 'error' || response.loadType === 'empty') {
        return [];
      }

      // Normalise: playlist tracks may be in response.tracks, response.data.tracks,
      // or (for a single track URL) response.data directly.
      let tracks = [];
      if (response.tracks?.length) {
        tracks = response.tracks;
      } else if (Array.isArray(response.data?.tracks)) {
        tracks = response.data.tracks;
      } else if (response.data && !Array.isArray(response.data)) {
        tracks = [response.data];
      }

      return tracks.map((track) => this.mapLavalinkTrack(track));
    } catch (error) {
      console.error('Error resolving playlist:', error.message);
      return [];
    }
  }

  async resolveSpotifyPlaylist(url) {
    const match = url.match(this.spotifyPlaylistRegex);
    if (!match) {
      console.warn('Invalid Spotify playlist URL');
      return [];
    }

    try {
      const node = this.getNode();
      if (!node) return [];

      const response = await node.search({ query: url }, null);
      if (!response || !response.tracks || response.loadType === 'error' || response.loadType === 'empty') {
        return [];
      }

      return response.tracks.map((track) => this.mapLavalinkTrack(track, 'spotify'));
    } catch (error) {
      console.error('Error resolving Spotify playlist:', error.message);
      return [];
    }
  }

  async searchYouTube(query, limit = 10) {
    return this.searchSource(query, 'youtube', limit);
  }

  async searchYouTubeMusic(query, limit = 10) {
    return this.searchSource(query, 'youtube_music', limit);
  }

  async searchSoundCloud(query, limit = 10) {
    return this.searchSource(query, 'soundcloud', limit);
  }

  async searchDeezer(query, limit = 10) {
    return this.searchSource(query, 'deezer', limit);
  }

  async searchSpotify(query, limit = 10) {
    return this.searchSource(query, 'spotify', limit);
  }

  async searchSource(query, source, limit = 10) {
    try {
      const tracks = await this.searchInternal(query, source);
      if (tracks.length === 0) return [];

      return tracks.slice(0, limit).map((track) => this.mapLavalinkTrack(track, source));
    } catch (error) {
      console.error(`Error searching ${source}:`, error.message);
      return [];
    }
  }

  async searchSpotifyRecommendations(seedTrackIds, limit = 10) {
    const seeds = [...new Set((seedTrackIds ?? []).filter(Boolean))].slice(0, 5);
    if (seeds.length === 0) return [];

    return this.searchSource(`seed_tracks=${seeds.join(',')}`, 'sprec', limit);
  }

  async searchYouTubeRelated(identifier, limit = 10) {
    if (!identifier) return [];

    const relatedUrl = `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`;
    const results = await this.searchSource(relatedUrl, 'youtube', limit + 1);
    return results.filter((track) => track.metadata?.identifier !== identifier).slice(0, limit);
  }

  getSearchSource(source) {
    switch (source) {
      case 'soundcloud':
        return 'scsearch';
      case 'spotify':
        return 'spsearch';
      case 'youtube_music':
        return 'ytmsearch';
      case 'deezer':
        return 'dzsearch';
      case 'sprec':
        return 'sprec';
      case 'youtube':
      default:
        return 'ytsearch';
    }
  }

  async searchInternal(query, source) {
    const node = this.getNode();
    if (!node) return [];

    // For direct URLs let lavalink-client resolve the source automatically.
    // Only set a source prefix for plain text search queries.
    const isUrl = this.isURL(query);
    const searchSource = isUrl ? undefined : this.getSearchSource(source);
    const response = await node.search({ query, source: searchSource }, null);
    return this.extractTracks(response);
  }

  extractTracks(response) {
    if (!response || response.loadType === 'error' || response.loadType === 'empty') {
      return [];
    }

    // lavalink-client v2 normalises everything into tracks[], but for
    // loadType:'track' some builds put the track object in response.data.
    if (response.tracks?.length) {
      return response.tracks;
    }

    if (Array.isArray(response.data?.tracks)) {
      return response.data.tracks;
    }

    if (response.data && !Array.isArray(response.data)) {
      return [response.data];
    }

    return [];
  }

  isURL(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  mapLavalinkTrack(lavalinkTrack, sourceHint) {
    const info = lavalinkTrack.info || lavalinkTrack;

    // lavalink-client may omit uri for some sources; fall back to constructing it
    const uri = info.uri || (info.identifier ? `https://www.youtube.com/watch?v=${info.identifier}` : null);
    const source = this.detectSource(uri, sourceHint || info.sourceName);

    const track = createMusicTrack({
      title: info.title || 'Unknown Title',
      artist: info.author || 'Unknown Artist',
      durationMs: info.duration ?? info.length ?? null,
      sourceUrl: uri,
      sourceType: source,
      thumbnailUrl: info.artworkUrl || null,
    });

    // Store the full lavalink-client track object so voice.js can play it directly
    track.metadata.lavalinkTrack = lavalinkTrack;
    track.metadata.identifier = info.identifier ?? null;
    track.metadata.sourceName = info.sourceName ?? sourceHint ?? null;
    track.metadata.canonicalSourceType = source;
    track.metadata.uri = uri;

    return track;
  }

  detectSource(uri, sourceHint) {
    if (sourceHint && SOURCE_MAP[sourceHint]) {
      return SOURCE_MAP[sourceHint];
    }

    const detected = detectMediaSource(uri);
    if (detected) {
      return detected;
    }

    return 'direct-url';
  }
}

export default new LavalinkMusicResolver();

function normalizeSearchSource(value) {
  switch (String(value ?? '').trim().toLowerCase()) {
    case 'spsearch':
    case 'spotify':
      return 'spotify';
    case 'ytmsearch':
    case 'youtube_music':
    case 'youtubemusic':
      return 'youtube_music';
    case 'ytsearch':
    case 'youtube':
      return 'youtube';
    case 'soundcloud':
    case 'scsearch':
      return 'soundcloud';
    case 'deezer':
    case 'dzsearch':
      return 'deezer';
    default:
      return null;
  }
}

function pickBestTextResult(results, query, source) {
  const ranked = (results ?? [])
    .map((track, index) => ({
      track,
      score: scoreResolvedTrack(track, query, source, index),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < MIN_TEXT_MATCH_SCORE) {
    return null;
  }

  return best.track;
}

function scoreResolvedTrack(track, query, source, index) {
  const normalizedQuery = normalizeTitle(query);
  const normalizedTitle = normalizeTitle(track.title);
  const normalizedArtist = normalizeArtist(track.artist);
  const haystack = `${normalizedTitle} ${normalizedArtist}`.trim();
  const queryTokens = tokenizeTitle(query);
  const titleTokens = tokenizeTitle(track.title);
  const wantsVariant = queryIncludesVariant(query);
  const penalizeVariant = !wantsVariant && isVariantTitle(track.title);

  let score = 0;

  if (!penalizeVariant && normalizedTitle === normalizedQuery) {
    score += 60;
  }

  if (haystack.includes(normalizedQuery)) {
    score += 30;
  }

  const tokenMatches = queryTokens.filter((token) => haystack.includes(token)).length;
  score += tokenMatches * 12;

  const extraTitleTokens = titleTokens.filter((token) => !queryTokens.includes(token));
  score -= extraTitleTokens.length * 3;

  switch (source) {
    case 'spotify':
      score += 20;
      break;
    case 'youtube_music':
      score += 14;
      break;
    case 'youtube':
      score += 8;
      break;
    case 'soundcloud':
      score += 4;
      break;
    case 'deezer':
      score += 10;
      break;
    default:
      break;
  }

  score -= index * 3;

  if (isGenericResultTitle(track.title)) {
    score -= 25;
  }

  if (penalizeVariant) {
    score -= 65;
  }

  if (isCanonicalOriginalTrack(track)) {
    score += 10;
  }

  if (TOPIC_CHANNEL_PATTERN.test(track.artist ?? '')) {
    score += 6;
  }

  if ((track.title ?? '').length > 90) {
    score -= 10;
  }

  if (queryTokens.length > 0 && titleTokens.length > 0) {
    const coverage = tokenMatches / queryTokens.length;
    score += Math.round(coverage * 10);
  }

  if (queryTokens.length === 1 && tokenMatches < 1) {
    score -= 30;
  }

  return score;
}

function queryIncludesVariant(value) {
  return isVariantTitle(value);
}
