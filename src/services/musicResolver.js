// src/services/musicResolver.js

import lavalinkResolver from './lavalinkMusicResolver.js';
import { extractSpotifyTrackId, getSpotifyTrackDetails, spotifyUriToWebUrl } from './spotifyRecommendations.js';
import { isCanonicalOriginalTrack } from './recommendationRules.js';
import {
  detectMediaSource,
  isHttpUrl,
  isSpotifyTrackUrl,
  normalizeMediaInput
} from '../utils/mediaUrls.js';

const SUPPORTED_SOURCES = ['youtube', 'spotify', 'soundcloud', 'deezer', 'local', 'tts'];

export class MusicResolver {
  constructor() {
    this.handlers = new Map();
    this.registerDefaultHandlers();
  }
  
  registerHandler(sourceType, handler) {
    this.handlers.set(sourceType, handler);
  }
  
  registerDefaultHandlers() {
    this.registerHandler('direct-url', this.resolveDirectUrl.bind(this));
  }

  getLavalinkResolver() {
    return lavalinkResolver;
  }

  getSupportedSources() {
    return SUPPORTED_SOURCES;
  }

  detectSource(input) {
    return detectMediaSource(input);
  }
  
  async resolve(input, context = {}) {
    const trimmed = await normalizeMediaInput(input.trim());
    if (!trimmed) {
      throw new Error('Please provide a music URL or query.');
    }

    const query = trimmed;
    const source = context.source || this.detectSource(query);
    const lavalinkResolver = this.getLavalinkResolver();

    if (!source && !isHttpUrl(trimmed) && lavalinkResolver?.resolveTextQuery) {
      try {
        const result = await this.resolveTextQuery(trimmed, context);
        if (result) {
          return result;
        }
      } catch (error) {
        console.error('[MusicResolver] Text resolve error:', error.message);
      }
    }

    if (lavalinkResolver) {
      try {
        const result = await lavalinkResolver.resolve(query, source);
        if (result) {
          const enriched = enrichCanonicalMetadata(result);
          if (source === 'spotify' && isSpotifyTrackUrl(query)) {
            const mirrored = await this.resolveSpotifyTrackMirror(enriched, context);
            if (mirrored) {
              return mirrored;
            }
            throw new Error('Could not verify a playable mirror for this Spotify track.');
          }
          return enriched;
        }
      } catch (error) {
        console.error('[MusicResolver] Lavalink resolver error:', error.message);
        if (error instanceof Error && /could not verify a playable mirror/i.test(error.message)) {
          throw error;
        }
        // Fall through to direct URL handlers.
      }
    }

    if (source === 'youtube' && isHttpUrl(trimmed)) {
      const fallbackResult = await this.resolveYouTubeUrlFallback(trimmed, context);
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    if ((source === 'soundcloud' || source === 'deezer') && isHttpUrl(trimmed)) {
      const fallbackResult = await this.resolveProviderUrlFallback(trimmed, source, context);
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    for (const [type, handler] of this.handlers) {
      const result = await handler(trimmed, context);
      if (result) {
        return {
          ...result,
          sourceType: type,
          metadata: {
            ...result.metadata,
            resolvedBy: type
          }
        };
      }
    }

    throw new Error('Unable to resolve this music source.');
  }

  async resolveTextQuery(query, context = {}) {
    const lavalinkResolver = this.getLavalinkResolver();
    if (!lavalinkResolver) return null;

    const result = await lavalinkResolver.resolveTextQuery(query, context);
    if (!result) {
      return null;
    }

    const enriched = enrichCanonicalMetadata(result);

    return {
      ...enriched,
      metadata: {
        ...enriched.metadata,
        autoplaySeedType: 'text',
        originalQuery: query
      }
    };
  }

  async resolveSpotifyTrackMirror(track, context = {}) {
    const lavalinkResolver = this.getLavalinkResolver();
    if (!lavalinkResolver) {
      return null;
    }

    const spotifyTrackId = track.metadata?.spotifyTrackId
      ?? extractSpotifyTrackId(track.metadata?.spotifyUri ?? track.metadata?.uri ?? track.playbackInput);
    const spotifyDetails = spotifyTrackId ? await getSpotifyTrackDetails(spotifyTrackId) : null;
    const mirrorSeed = buildSpotifyMirrorSeed(track, spotifyDetails);
    const query = [mirrorSeed.artist, mirrorSeed.title].filter(Boolean).join(' ').trim();
    if (!query && !mirrorSeed.isrc) {
      return null;
    }

    const queryBatches = buildSpotifyMirrorQueryBatches(mirrorSeed, query);
    const lavalinkCandidateKeys = new Set();
    const webCandidateKeys = new Set();
    const hydrationCache = new Map();
    let mergedCandidates = [];
    let prioritizedMirrors = [];

    for (const queryBatch of queryBatches) {
      const [lavalinkCandidates, webCandidates] = await Promise.all([
        searchSpotifyMirrorCandidates(lavalinkResolver, queryBatch, lavalinkCandidateKeys),
        searchSpotifyMirrorWebCandidates(queryBatch, webCandidateKeys),
      ]);

      if (lavalinkCandidates.length === 0 && webCandidates.length === 0) {
        continue;
      }

      mergedCandidates = mergeSpotifyMirrorCandidates(
        mergedCandidates,
        [...lavalinkCandidates, ...webCandidates]
      );

      const rankedCandidates = rankSpotifyMirrorCandidates(mirrorSeed, mergedCandidates);
      const hydratedMirrors = await hydrateSpotifyMirrorCandidates(lavalinkResolver, rankedCandidates, hydrationCache);
      prioritizedMirrors = prioritizeHydratedSpotifyMirrors(hydratedMirrors);

      if (shouldShortCircuitSpotifyMirror(prioritizedMirrors[0])) {
        break;
      }
    }

    if (prioritizedMirrors.length === 0) {
      logSpotifyMirrorMiss(mirrorSeed, mergedCandidates);
      return null;
    }

    const [mirror, ...fallbackMirrors] = prioritizedMirrors;

    return {
      ...mirror,
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs ?? mirror.durationMs,
      sourceType: 'spotify',
      metadata: {
        ...track.metadata,
        ...mirror.metadata,
        originalSpotifyTrack: track.metadata?.lavalinkTrack ?? null,
        mirrorTitle: mirror.title,
        mirrorArtist: mirror.artist,
        mirrorPlaybackInput: mirror.playbackInput,
        mirrorSourceType: mirror.sourceType,
        mirrorFallbackCandidates: fallbackMirrors.map(serializeMirrorFallbackCandidate),
        spotifyArtistNames: mirrorSeed.artists ?? null,
        spotifyAlbum: mirrorSeed.album ?? null,
        spotifyIsrc: mirrorSeed.isrc ?? null,
        spotifyUri: track.metadata?.spotifyUri ?? track.metadata?.uri ?? track.playbackInput,
        spotifyTrackId: spotifyTrackId ?? null,
        canonicalUrl: track.metadata?.canonicalUrl ?? spotifyUriToWebUrl(track.metadata?.spotifyUri ?? track.metadata?.uri ?? track.playbackInput),
        canonicalSourceType: 'spotify',
        resolvedBy: track.metadata?.resolvedBy
          ? `${track.metadata.resolvedBy}:youtube-mirror`
          : 'spotify:youtube-mirror'
      }
    };
  }

  async resolveYouTubeUrlFallback(url, context = {}) {
    const lavalinkResolver = this.getLavalinkResolver();
    const videoMetadata = await getYouTubeOEmbedMetadata(url);
    if (!videoMetadata?.title) {
      return null;
    }

    const fallback = await resolveYouTubeUrlMetadataFallback(lavalinkResolver, videoMetadata)
      ?? await this.resolveTextQuery(videoMetadata.title, {
        ...context,
        sources: ['youtube_music', 'youtube']
      });

    if (!fallback) {
      return null;
    }

    return {
      ...fallback,
      metadata: {
        ...fallback.metadata,
        autoplaySeedType: 'youtube',
        originalUrl: url,
        originalTitle: videoMetadata.title,
        originalAuthor: videoMetadata.author ?? null,
        canonicalUrl: url,
        canonicalSourceType: 'youtube',
        resolvedBy: fallback.metadata?.resolvedBy
          ? `${fallback.metadata.resolvedBy}:url-fallback`
          : 'youtube-url-fallback'
      }
    };
  }

  async resolveProviderUrlFallback(url, source, context = {}) {
    const lavalinkResolver = this.getLavalinkResolver();
    const providerMetadata = await getProviderUrlMetadata(url, source);
    if (!providerMetadata?.title) {
      return null;
    }

    const fallback = await resolveProviderUrlMetadataFallback(lavalinkResolver, source, providerMetadata);
    if (!fallback) {
      return null;
    }

    return {
      ...fallback,
      metadata: {
        ...fallback.metadata,
        autoplaySeedType: source,
        originalUrl: url,
        originalTitle: providerMetadata.title,
        originalAuthor: providerMetadata.author ?? null,
        canonicalUrl: url,
        canonicalSourceType: source,
        resolvedBy: fallback.metadata?.resolvedBy
          ? `${fallback.metadata.resolvedBy}:url-fallback`
          : `${source}-url-fallback`
      }
    };
  }

  async resolvePlaylist(input, context = {}) {
    const trimmed = await normalizeMediaInput(input.trim());
    if (!trimmed) {
      throw new Error('Please provide a playlist URL or query.');
    }

    const query = trimmed;
    const source = context.source || this.detectSource(query);
    const lavalinkResolver = this.getLavalinkResolver();

    if (lavalinkResolver) {
      try {
        const result = await lavalinkResolver.resolvePlaylist(query, source);
        if (result) {
          return result;
        }
      } catch (error) {
        // Fall through to plugin handlers
      }
    }

    for (const [type, handler] of this.handlers) {
      if (handler.resolvePlaylist) {
        const result = await handler.resolvePlaylist(trimmed, context);
        if (result) {
          return {
            ...result,
            sourceType: type,
            metadata: {
              ...result.metadata,
              resolvedBy: type
            }
          };
        }
      }
    }

    throw new Error('Unable to resolve this playlist.');
  }
  
  async resolveDirectUrl(url, context) {
    if (!isHttpUrl(url)) {
      return null;
    }
    
    if (isUnsupportedHost(url)) {
      return null;
    }
    
    if (!looksLikePlayableAudio(url)) {
      return null;
    }
    
    return {
      title: context.explicitTitle || extractTitleFromUrl(url),
      playbackInput: url,
      metadata: {
        thumbnailUrl: null
      }
    };
  }
}

const UNSUPPORTED_HOSTS = [
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtu.be', 'spotify.com', 'open.spotify.com', 'spotify.link',
  'soundcloud.com', 'www.soundcloud.com', 'on.soundcloud.com',
  'deezer.com', 'www.deezer.com', 'deezer.page.link', 'link.deezer.com'
];

function isUnsupportedHost(url) {
  try {
    const parsed = new URL(url);
    return UNSUPPORTED_HOSTS.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const PLAYABLE_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.flac', '.webm', '.mp4', '.m3u8', '.pls'];

function looksLikePlayableAudio(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return PLAYABLE_EXTENSIONS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

function extractTitleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments.at(-1);
    if (!last) return parsed.hostname;
    return decodeURIComponent(last)
      .replace(/\.[a-z0-9]{2,5}$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim() || parsed.hostname;
  } catch {
    return 'Unknown audio source';
  }
}

export const musicResolver = new MusicResolver();

function enrichCanonicalMetadata(track) {
  const spotifyUri = track.metadata?.spotifyUri
    ?? track.metadata?.uri
    ?? (track.sourceType === 'spotify' ? track.playbackInput : null);
  const spotifyTrackId = extractSpotifyTrackId(spotifyUri);

  if (!spotifyTrackId) {
    return track;
  }

  return {
    ...track,
    metadata: {
      ...track.metadata,
      spotifyUri,
      spotifyTrackId,
      canonicalUrl: spotifyUriToWebUrl(spotifyUri),
      canonicalSourceType: 'spotify'
    }
  };
}

function isLikelySpotifyMirror(spotifyTrack, mirrorTrack) {
  const spotifyTitleTokens = tokenize(spotifyTrack.title);
  const mirrorTitleTokens = tokenize(mirrorTrack.title);
  const spotifyArtistTokens = tokenize(spotifyTrack.artist);
  const mirrorArtistTokens = tokenize(mirrorTrack.artist);

  const titleOverlap = spotifyTitleTokens.filter((token) => mirrorTitleTokens.includes(token)).length;
  const artistOverlap = spotifyArtistTokens.filter((token) => mirrorArtistTokens.includes(token)).length;

  if (spotifyTitleTokens.length === 0) {
    return false;
  }

  if (titleOverlap === spotifyTitleTokens.length) {
    return true;
  }

  return titleOverlap >= Math.max(1, Math.ceil(spotifyTitleTokens.length / 2)) && artistOverlap >= 1;
}

async function searchSpotifyMirrorCandidates(lavalinkResolver, queries, seen = new Set()) {
  const searchFns = [
    lavalinkResolver.searchYouTubeMusic?.bind(lavalinkResolver),
    lavalinkResolver.searchYouTube?.bind(lavalinkResolver),
  ].filter(Boolean);
  const candidates = [];

  for (const candidateQuery of queries) {
    const batches = await Promise.all(
      searchFns.map((searchFn) => searchFn(candidateQuery, 100).catch(() => []))
    );
    for (const results of batches) {
      for (const result of results ?? []) {
        const key = String(
          result?.metadata?.identifier
          ?? result?.playbackInput
          ?? result?.sourceUrl
          ?? ''
        ).trim().toLowerCase();
        if (!key || seen.has(key)) {
          continue;
        }
        seen.add(key);
        candidates.push({
          ...result,
          metadata: {
            ...result?.metadata,
            mirrorSearchQuery: candidateQuery,
          }
        });
      }
    }
  }

  return candidates;
}

async function searchSpotifyMirrorWebCandidates(queries, seen = new Set()) {
  const candidates = [];

  for (const candidateQuery of queries) {
    const results = await searchYouTubeWebCandidates(candidateQuery, 15).catch(() => []);
    for (const result of results ?? []) {
      const key = String(
        result?.metadata?.identifier
        ?? result?.playbackInput
        ?? result?.sourceUrl
        ?? ''
      ).trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      candidates.push({
        ...result,
        metadata: {
          ...result?.metadata,
          mirrorSearchQuery: candidateQuery,
          mirrorSourceKind: 'youtube-web-search',
        }
      });
    }
  }

  return candidates;
}

function rankSpotifyMirrorCandidates(spotifyTrack, candidates) {
  return (candidates ?? [])
    .map((candidate) => ({
      candidate,
      score: scoreSpotifyMirrorCandidate(spotifyTrack, candidate),
    }))
    .sort((a, b) => b.score - a.score);
}

function mergeSpotifyMirrorCandidates(lavalinkCandidates, webCandidates) {
  const merged = new Map();

  for (const candidate of [...(lavalinkCandidates ?? []), ...(webCandidates ?? [])]) {
    const key = getSpotifyMirrorCandidateKey(candidate);
    if (!key) {
      continue;
    }

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, candidate);
      continue;
    }

    merged.set(key, mergeSpotifyMirrorCandidate(existing, candidate));
  }

  return [...merged.values()];
}

function mergeSpotifyMirrorCandidate(left, right) {
  const preferred = left?.metadata?.lavalinkTrack ? left : right?.metadata?.lavalinkTrack ? right : left;
  const secondary = preferred === left ? right : left;

  return {
    ...secondary,
    ...preferred,
    title: preferred?.title ?? secondary?.title ?? null,
    artist: preferred?.artist ?? secondary?.artist ?? null,
    durationMs: preferred?.durationMs ?? secondary?.durationMs ?? null,
    playbackInput: preferred?.playbackInput ?? secondary?.playbackInput ?? secondary?.sourceUrl ?? null,
    sourceUrl: preferred?.sourceUrl ?? secondary?.sourceUrl ?? secondary?.playbackInput ?? null,
    sourceType: preferred?.sourceType ?? secondary?.sourceType ?? null,
    metadata: {
      ...secondary?.metadata,
      ...preferred?.metadata,
      mirrorSearchQuery: preferred?.metadata?.mirrorSearchQuery
        ?? secondary?.metadata?.mirrorSearchQuery
        ?? null,
      mirrorSourceKind: secondary?.metadata?.mirrorSourceKind
        ?? preferred?.metadata?.mirrorSourceKind
        ?? null,
      mirrorWebViews: secondary?.metadata?.mirrorWebViews
        ?? preferred?.metadata?.mirrorWebViews
        ?? null,
    }
  };
}

function getSpotifyMirrorCandidateKey(candidate) {
  return String(
    candidate?.metadata?.identifier
    ?? candidate?.playbackInput
    ?? candidate?.sourceUrl
    ?? ''
  ).trim().toLowerCase();
}

async function hydrateSpotifyMirrorCandidates(lavalinkResolver, rankedCandidates, cache = new Map()) {
  const hydrated = [];

  for (const { candidate, score } of rankedCandidates) {
    if (score < 80) {
      continue;
    }

    let resolved;
    if (candidate?.metadata?.lavalinkTrack) {
      resolved = candidate;
    } else {
      const candidateKey = getSpotifyMirrorCandidateKey(candidate);
      resolved = candidateKey ? cache.get(candidateKey) : undefined;
      if (resolved === undefined) {
        resolved = await hydrateSpotifyMirrorCandidate(lavalinkResolver, candidate);
        if (candidateKey && resolved) {
          cache.set(candidateKey, resolved);
        }
      }
    }
    if (!resolved) {
      continue;
    }

    resolved.metadata = {
      ...resolved.metadata,
      mirrorScore: score,
      mirrorSearchQuery: candidate.metadata?.mirrorSearchQuery ?? null,
      mirrorSourceKind: candidate.metadata?.mirrorSourceKind ?? resolved.metadata?.mirrorSourceKind ?? 'lavalink-search',
      mirrorWebViews: candidate.metadata?.mirrorWebViews ?? resolved.metadata?.mirrorWebViews ?? null,
    };

    hydrated.push(resolved);
    if (hydrated.length >= 8) {
      break;
    }
  }

  return hydrated;
}

async function hydrateSpotifyMirrorCandidate(lavalinkResolver, candidate) {
  if (candidate?.metadata?.lavalinkTrack) {
    return candidate;
  }

  return resolveWebMirrorCandidate(lavalinkResolver, candidate);
}

function serializeMirrorFallbackCandidate(candidate) {
  return {
    title: candidate?.title ?? null,
    artist: candidate?.artist ?? null,
    durationMs: candidate?.durationMs ?? null,
    playbackInput: candidate?.playbackInput ?? candidate?.sourceUrl ?? null,
    sourceType: candidate?.sourceType ?? null,
    metadata: {
      lavalinkTrack: candidate?.metadata?.lavalinkTrack ?? null,
      identifier: candidate?.metadata?.identifier ?? null,
      sourceName: candidate?.metadata?.sourceName ?? null,
      mirrorPlaybackInput: candidate?.playbackInput ?? candidate?.sourceUrl ?? null,
      mirrorTitle: candidate?.title ?? null,
      mirrorArtist: candidate?.artist ?? null,
      mirrorSearchQuery: candidate?.metadata?.mirrorSearchQuery ?? null,
      mirrorSourceKind: candidate?.metadata?.mirrorSourceKind ?? null,
      mirrorWebViews: candidate?.metadata?.mirrorWebViews ?? null,
      mirrorScore: candidate?.metadata?.mirrorScore ?? null,
    }
  };
}

function scoreSpotifyMirrorCandidate(spotifyTrack, mirrorTrack) {
  let score = 0;

  const spotifyTitle = normalizeText(spotifyTrack.title);
  const mirrorTitle = normalizeText(mirrorTrack.title);
  const spotifyArtists = getSpotifyArtistNames(spotifyTrack);
  const spotifyArtist = normalizeText(spotifyArtists[0] ?? spotifyTrack.artist);
  const mirrorArtist = normalizeText(mirrorTrack.artist);
  const mirrorSearchQuery = String(mirrorTrack?.metadata?.mirrorSearchQuery ?? '').replaceAll('"', '').trim();
  const fromIsrcQuery = Boolean(spotifyTrack.isrc)
    && normalizeText(mirrorSearchQuery) === normalizeText(spotifyTrack.isrc);
  const mirrorViews = Number(mirrorTrack?.metadata?.mirrorWebViews ?? 0);

  const spotifyTitleTokens = tokenize(spotifyTrack.title);
  const mirrorTitleTokens = tokenize(mirrorTrack.title);
  const spotifyArtistTokens = tokenize(spotifyArtists.join(' '));
  const mirrorArtistTokens = tokenize(mirrorTrack.artist);
  const mirrorTitleArtistTokens = tokenize(mirrorTrack.title);

  const titleOverlap = spotifyTitleTokens.filter((token) => mirrorTitleTokens.includes(token)).length;
  const artistOverlap = spotifyArtistTokens.filter((token) => mirrorArtistTokens.includes(token)).length;
  const titleArtistOverlap = spotifyArtistTokens.filter((token) => mirrorTitleArtistTokens.includes(token)).length;
  const exactArtistMatch = spotifyArtists
    .map((artist) => normalizeText(artist))
    .filter(Boolean)
    .some((artist) => mirrorArtist === artist || mirrorArtist.includes(artist) || artist.includes(mirrorArtist));
  const artistEvidence = artistOverlap > 0 || titleArtistOverlap > 0 || exactArtistMatch || fromIsrcQuery;

  if (!artistEvidence) {
    return -1_000;
  }

  if (titleOverlap < Math.max(1, Math.ceil(spotifyTitleTokens.length / 2))) {
    return -1_000;
  }

  if (spotifyTitle && mirrorTitle === spotifyTitle) {
    score += 90;
  } else if (spotifyTitle && (mirrorTitle.includes(spotifyTitle) || spotifyTitle.includes(mirrorTitle))) {
    score += 55;
  } else if (spotifyTitleTokens.length > 0) {
    score += Math.round((titleOverlap / spotifyTitleTokens.length) * 45);
  }

  if (spotifyArtist && exactArtistMatch) {
    score += 60;
  } else {
    score += artistOverlap * 22;
  }

  if (titleArtistOverlap > 0) {
    score += Math.min(18, titleArtistOverlap * 9);
  }

  const durationDelta = Math.abs((spotifyTrack.durationMs ?? 0) - (mirrorTrack.durationMs ?? 0));
  if (spotifyTrack.durationMs && mirrorTrack.durationMs) {
    if (durationDelta <= 7_500) {
      score += 20;
    } else if (durationDelta <= 20_000) {
      score += 8;
    } else if (durationDelta >= 45_000) {
      score -= 30;
    }
  }

  if (fromIsrcQuery) {
    if (durationDelta >= 20_000) {
      return -1_000;
    }
    score += 80;
  }

  if (OFFICIAL_VIDEO_PATTERN.test(mirrorTrack.title ?? '')) {
    score += 22;
  } else if (OFFICIAL_AUDIO_PATTERN.test(mirrorTrack.title ?? '')) {
    score += 10;
  }

  if (TOPIC_CHANNEL_PATTERN.test(mirrorTrack.artist ?? '')) {
    score -= 42;
  }

  if (mirrorViews >= 1_000_000) {
    score += Math.min(28, Math.round(Math.log10(mirrorViews) * 3));
  }

  if (MIRROR_VARIANT_PATTERNS.some((pattern) => pattern.test(mirrorTrack.title ?? ''))) {
    score -= 70;
  }

  if ((mirrorTrack.title ?? '').length > 100) {
    score -= 8;
  }

  return score;
}

function prioritizeHydratedSpotifyMirrors(mirrors) {
  const rankedMirrors = [...(mirrors ?? [])].sort((left, right) => {
    return (right?.metadata?.mirrorScore ?? 0) - (left?.metadata?.mirrorScore ?? 0);
  });

  const strongNonTopicMirrors = rankedMirrors.filter((mirror) => (
    !TOPIC_CHANNEL_PATTERN.test(mirror?.artist ?? '')
    && (
      OFFICIAL_VIDEO_PATTERN.test(mirror?.title ?? '')
      || OFFICIAL_AUDIO_PATTERN.test(mirror?.title ?? '')
      || Number(mirror?.metadata?.mirrorWebViews ?? 0) >= 100_000
    )
  ));

  if (strongNonTopicMirrors.length === 0) {
    return rankedMirrors;
  }

  const strongMirrorKeys = new Set(strongNonTopicMirrors.map((mirror) => (
    mirror?.metadata?.identifier
    ?? mirror?.playbackInput
    ?? mirror?.sourceUrl
  )));

  const remainingMirrors = rankedMirrors.filter((mirror) => !strongMirrorKeys.has(
    mirror?.metadata?.identifier
    ?? mirror?.playbackInput
    ?? mirror?.sourceUrl
  ));

  return [...strongNonTopicMirrors, ...remainingMirrors];
}

function shouldShortCircuitSpotifyMirror(mirror) {
  if (!mirror) {
    return false;
  }

  const score = Number(mirror?.metadata?.mirrorScore ?? 0);
  const views = Number(mirror?.metadata?.mirrorWebViews ?? 0);
  const isTopic = TOPIC_CHANNEL_PATTERN.test(mirror?.artist ?? '');
  const isOfficial = OFFICIAL_VIDEO_PATTERN.test(mirror?.title ?? '')
    || OFFICIAL_AUDIO_PATTERN.test(mirror?.title ?? '');

  if (isTopic) {
    return false;
  }

  return score >= 150 || (score >= 110 && (isOfficial || views >= 100_000));
}

function logSpotifyMirrorMiss(spotifyTrack, candidates) {
  const preview = (candidates ?? [])
    .map((candidate) => ({
      title: candidate?.title ?? null,
      artist: candidate?.artist ?? null,
      durationMs: candidate?.durationMs ?? null,
      playbackInput: candidate?.playbackInput ?? null,
      query: candidate?.metadata?.mirrorSearchQuery ?? null,
      sourceKind: candidate?.metadata?.mirrorSourceKind ?? 'lavalink-search',
      views: candidate?.metadata?.mirrorWebViews ?? null,
      score: scoreSpotifyMirrorCandidate(spotifyTrack, candidate),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  console.warn('[MusicResolver] No verified Spotify mirror found', {
    title: spotifyTrack?.title ?? null,
    artist: spotifyTrack?.artist ?? null,
    isrc: spotifyTrack?.isrc ?? null,
    candidateCount: candidates?.length ?? 0,
    preview,
  });
}

function buildSpotifyMirrorSeed(track, spotifyDetails) {
  const artists = getSpotifyArtistNames({
    ...track,
    artist: spotifyDetails?.artist ?? track.artist,
    artists: spotifyDetails?.artists ?? track.metadata?.spotifyArtistNames ?? null,
  });

  return {
    ...track,
    title: spotifyDetails?.title ?? track.title,
    artist: artists[0] ?? spotifyDetails?.artist ?? track.artist,
    artists,
    album: spotifyDetails?.album
      ?? track.metadata?.spotifyAlbum
      ?? track.metadata?.lavalinkTrack?.pluginInfo?.albumName
      ?? null,
    isrc: spotifyDetails?.isrc
      ?? track.metadata?.spotifyIsrc
      ?? track.metadata?.lavalinkTrack?.info?.isrc
      ?? track.metadata?.lavalinkTrack?.pluginInfo?.isrc
      ?? null,
    durationMs: spotifyDetails?.durationMs ?? track.durationMs,
  };
}

function buildSpotifyMirrorQueries(spotifyTrack, fallbackQuery) {
  const queries = [];
  const title = spotifyTrack.title?.trim();
  const artists = getSpotifyArtistNames(spotifyTrack);
  const primaryArtist = artists[0] ?? spotifyTrack.artist?.trim();
  const album = spotifyTrack.album?.trim();
  const isrc = spotifyTrack.isrc?.trim();

  if (isrc) {
    queries.push(isrc, `"${isrc}"`);
  }

  queries.push(
    fallbackQuery,
    `${title} ${primaryArtist}`,
    `${title} by ${primaryArtist}`,
    `${primaryArtist} - ${title}`,
    `${primaryArtist} ${title} official audio`,
    `${primaryArtist} ${title} official video`,
    `"${title}" "${primaryArtist}"`,
  );

  if (album && album.toLowerCase() !== title?.toLowerCase()) {
    queries.push(`${primaryArtist} ${title} ${album}`);
  }

  if (artists.length > 1) {
    queries.push(`${title} ${artists.join(' ')}`);
  }

  return [...new Set(
    queries
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  )];
}

function buildSpotifyMirrorQueryBatches(spotifyTrack, fallbackQuery) {
  const orderedQueries = buildSpotifyMirrorQueries(spotifyTrack, fallbackQuery);
  return orderedQueries.map((query) => [query]);
}

function getSpotifyArtistNames(track) {
  const candidates = [
    ...(Array.isArray(track?.artists) ? track.artists : []),
    ...(Array.isArray(track?.metadata?.spotifyArtistNames) ? track.metadata.spotifyArtistNames : []),
    track?.artist,
  ];

  return [...new Set(
    candidates
      .map((artist) => String(artist ?? '').trim())
      .filter(Boolean)
  )];
}

async function resolveWebMirrorCandidate(lavalinkResolver, candidate) {
  const playbackInput = candidate?.playbackInput ?? candidate?.sourceUrl ?? null;
  if (!playbackInput) {
    return null;
  }

  const resolved = await lavalinkResolver.resolve(playbackInput, 'youtube').catch(() => null);
  const hydrated = resolved ?? await resolveWebMirrorCandidateViaSearch(lavalinkResolver, candidate);
  if (!hydrated) {
    return null;
  }

  return {
    ...hydrated,
    metadata: {
      ...hydrated.metadata,
      mirrorWebCandidate: {
        title: candidate.title ?? null,
        artist: candidate.artist ?? null,
        durationMs: candidate.durationMs ?? null,
        playbackInput,
      }
    }
  };
}

async function resolveWebMirrorCandidateViaSearch(lavalinkResolver, candidate) {
  const searchFns = [
    lavalinkResolver.searchYouTubeMusic?.bind(lavalinkResolver),
    lavalinkResolver.searchYouTube?.bind(lavalinkResolver),
  ].filter(Boolean);

  if (searchFns.length === 0) {
    return null;
  }

  const queries = [...new Set(
    [
      candidate?.title,
      [candidate?.artist, candidate?.title].filter(Boolean).join(' ').trim(),
      candidate?.metadata?.mirrorSearchQuery,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  )];

  const expectedIdentifier = String(candidate?.metadata?.identifier ?? '').trim();
  const expectedPlaybackInput = String(candidate?.playbackInput ?? candidate?.sourceUrl ?? '').trim().toLowerCase();

  for (const query of queries) {
    for (const searchFn of searchFns) {
      const results = await searchFn(query, 10).catch(() => []);
      const match = (results ?? []).find((result) => isMatchingWebMirrorSearchResult(
        result,
        candidate,
        expectedIdentifier,
        expectedPlaybackInput
      ));
      if (match) {
        return match;
      }
    }
  }

  return null;
}

function isMatchingWebMirrorSearchResult(result, candidate, expectedIdentifier, expectedPlaybackInput) {
  const resultIdentifier = String(result?.metadata?.identifier ?? '').trim();
  if (expectedIdentifier && resultIdentifier) {
    return expectedIdentifier === resultIdentifier;
  }

  const resultInput = String(result?.playbackInput ?? result?.sourceUrl ?? '').trim().toLowerCase();
  if (expectedPlaybackInput && resultInput && expectedPlaybackInput === resultInput) {
    return true;
  }

  const candidateTitle = normalizeText(candidate?.title);
  const resultTitle = normalizeText(result?.title);
  const candidateArtist = normalizeText(candidate?.artist);
  const resultArtist = normalizeText(result?.artist);
  const durationDelta = Math.abs((candidate?.durationMs ?? 0) - (result?.durationMs ?? 0));

  return Boolean(
    candidateTitle
    && resultTitle
    && candidateTitle === resultTitle
    && candidateArtist
    && resultArtist
    && (candidateArtist === resultArtist || resultArtist.includes(candidateArtist) || candidateArtist.includes(resultArtist))
    && (!candidate?.durationMs || !result?.durationMs || durationDelta <= 10_000)
  );
}

async function searchYouTubeWebCandidates(query, limit = 10) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  const initialData = extractYouTubeInitialData(html);
  if (!initialData) {
    return [];
  }

  const candidates = [];
  walkObject(initialData, (node) => {
    const renderer = node?.videoRenderer;
    if (!renderer?.videoId) {
      return;
    }

    const title = getTextFromRuns(renderer.title);
    const artist = getTextFromRuns(renderer.ownerText);
    const durationText = getTextFromRuns(renderer.lengthText);
    const durationMs = parseDurationToMs(durationText);
    const viewsText = getTextFromRuns(renderer.viewCountText);
    const views = parseViewCount(viewsText);

    candidates.push({
      title: title || 'Unknown Title',
      artist: artist || 'Unknown Artist',
      durationMs,
      sourceType: 'youtube',
      playbackInput: `https://www.youtube.com/watch?v=${renderer.videoId}`,
      sourceUrl: `https://www.youtube.com/watch?v=${renderer.videoId}`,
      metadata: {
        identifier: renderer.videoId,
        sourceName: 'youtube',
        mirrorSourceKind: 'youtube-web-search',
        mirrorWebViews: views,
      }
    });
  });

  return candidates.slice(0, limit);
}

function extractYouTubeInitialData(html) {
  const markers = ['var ytInitialData = ', 'ytInitialData = '];

  for (const marker of markers) {
    const markerIndex = html.indexOf(marker);
    if (markerIndex === -1) {
      continue;
    }

    const start = markerIndex + marker.length;
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let index = start; index < html.length; index += 1) {
      const char = html[index];

      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === '\\') {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, index + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }

  return null;
}

function walkObject(node, visit) {
  if (!node || typeof node !== 'object') {
    return;
  }

  visit(node);

  if (Array.isArray(node)) {
    for (const value of node) {
      walkObject(value, visit);
    }
    return;
  }

  for (const value of Object.values(node)) {
    walkObject(value, visit);
  }
}

function getTextFromRuns(value) {
  if (!value) {
    return '';
  }

  if (typeof value.simpleText === 'string') {
    return value.simpleText;
  }

  if (Array.isArray(value.runs)) {
    return value.runs.map((run) => run?.text ?? '').join('').trim();
  }

  return '';
}

function parseDurationToMs(value) {
  const parts = String(value ?? '')
    .split(':')
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => Number.isFinite(segment));

  if (parts.length === 0) {
    return null;
  }

  let totalSeconds = 0;
  for (const part of parts) {
    totalSeconds = (totalSeconds * 60) + part;
  }

  return totalSeconds * 1000;
}

function parseViewCount(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  if (!digits) {
    return null;
  }

  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/official|video|audio|lyrics|lyrical|hd|hq|4k/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 1);
}

const MIRROR_VARIANT_PATTERNS = [
  /\bcover\b/i,
  /\bremix\b/i,
  /\blive\b/i,
  /\bacoustic\b/i,
  /\bslowed\b/i,
  /\breverb\b/i,
  /\bsped ?up\b/i,
  /\bkaraoke\b/i,
  /\blo[- ]?fi\b/i,
];
const TOPIC_CHANNEL_PATTERN = /\btopic\b/i;
const OFFICIAL_VIDEO_PATTERN = /\bofficial music video\b/i;
const OFFICIAL_AUDIO_PATTERN = /\bofficial audio\b/i;

async function getYouTubeOEmbedTitle(url) {
  const metadata = await getYouTubeOEmbedMetadata(url);
  return metadata?.title ?? null;
}

async function getYouTubeOEmbedMetadata(url) {
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const title = typeof data?.title === 'string' && data.title.trim()
      ? data.title.trim()
      : null;
    if (!title) {
      return null;
    }

    return {
      title,
      author: typeof data?.author_name === 'string' && data.author_name.trim()
        ? data.author_name.trim()
        : null,
    };
  } catch {
    return null;
  }
}

async function getProviderUrlMetadata(url, source) {
  switch (source) {
    case 'soundcloud':
      return getSoundCloudUrlMetadata(url);
    case 'deezer':
      return getDeezerUrlMetadata(url);
    default:
      return null;
  }
}

async function getSoundCloudUrlMetadata(url) {
  try {
    const endpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    const response = await fetch(endpoint);
    if (response.ok) {
      const data = await response.json();
      const metadata = normalizeProviderMetadata({
        title: data?.title,
        author: data?.author_name
      });
      if (metadata?.title) {
        return metadata;
      }
    }
  } catch {
    // Fall through to generic page metadata.
  }

  return getHtmlPageMetadata(url);
}

async function getDeezerUrlMetadata(url) {
  const deezerTrackId = extractDeezerTrackId(url);
  if (deezerTrackId) {
    try {
      const response = await fetch(`https://api.deezer.com/track/${deezerTrackId}`);
      if (response.ok) {
        const data = await response.json();
        const metadata = normalizeProviderMetadata({
          title: data?.title,
          author: data?.artist?.name
        });
        if (metadata?.title) {
          return metadata;
        }
      }
    } catch {
      // Fall through to generic page metadata.
    }
  }

  return getHtmlPageMetadata(url);
}

function extractDeezerTrackId(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/track\/(\d+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function getHtmlPageMetadata(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const metadata = normalizeProviderMetadata({
      title: extractHtmlMetaContent(html, 'property', 'og:title')
        ?? extractHtmlMetaContent(html, 'name', 'twitter:title')
        ?? extractHtmlTitle(html),
      author: extractHtmlMetaContent(html, 'name', 'author')
        ?? extractHtmlMetaContent(html, 'property', 'music:musician')
        ?? extractHtmlMetaContent(html, 'property', 'og:site_name')
    });

    return metadata?.title ? metadata : null;
  } catch {
    return null;
  }
}

function extractHtmlMetaContent(html, attributeName, attributeValue) {
  const escaped = escapeRegex(attributeValue);
  const patterns = [
    new RegExp(`<meta[^>]+${attributeName}=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attributeName}=["']${escaped}["'][^>]*>`, 'i')
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
}

function extractHtmlTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
}

function decodeHtmlEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

function normalizeProviderMetadata({ title, author }) {
  const normalizedTitle = String(title ?? '').trim();
  const normalizedAuthor = String(author ?? '').trim();

  if (!normalizedTitle) {
    return null;
  }

  return {
    title: normalizedTitle,
    author: normalizedAuthor || null
  };
}

async function resolveYouTubeUrlMetadataFallback(lavalinkResolver, videoMetadata) {
  if (!lavalinkResolver) {
    return null;
  }

  const searchFns = [
    ['youtube_music', lavalinkResolver.searchYouTubeMusic?.bind(lavalinkResolver)],
    ['youtube', lavalinkResolver.searchYouTube?.bind(lavalinkResolver)],
  ].filter(([, searchFn]) => typeof searchFn === 'function');

  if (searchFns.length === 0) {
    return null;
  }

  const candidates = [];
  const seen = new Set();
  const queries = buildYouTubeUrlFallbackQueries(videoMetadata);

  for (const query of queries) {
    const batches = await Promise.all(
      searchFns.map(async ([source, searchFn]) => ({
        source,
        query,
        results: await searchFn(query, 8).catch(() => []),
      }))
    );

    for (const batch of batches) {
      for (const result of batch.results ?? []) {
        const key = String(
          result?.metadata?.identifier
          ?? result?.playbackInput
          ?? result?.sourceUrl
          ?? ''
        ).trim().toLowerCase();
        if (!key || seen.has(key)) {
          continue;
        }
        seen.add(key);
        candidates.push({
          ...result,
          metadata: {
            ...result?.metadata,
            resolvedBy: result?.metadata?.resolvedBy ?? `search:${batch.source}`,
            searchQuery: batch.query,
          }
        });
      }
    }
  }

  const ranked = rankYouTubeUrlFallbackCandidates(videoMetadata, candidates);
  const best = ranked[0];
  if (!best) {
    return null;
  }

  const minimumScore = videoMetadata.author ? 70 : 50;
  return best.score >= minimumScore ? best.candidate : null;
}

async function resolveProviderUrlMetadataFallback(lavalinkResolver, providerSource, providerMetadata) {
  if (!lavalinkResolver) {
    return null;
  }

  const fallbackSources = getProviderFallbackSources(providerSource);
  const candidates = [];
  const seen = new Set();
  const queries = buildProviderUrlFallbackQueries(providerMetadata);

  for (const query of queries) {
    const batches = await Promise.all(
      fallbackSources.map(async (source) => ({
        source,
        results: await lavalinkResolver.searchSource(query, source, source === providerSource ? 8 : 6).catch(() => []),
      }))
    );

    for (const batch of batches) {
      for (const result of batch.results ?? []) {
        const key = String(
          result?.metadata?.identifier
          ?? result?.playbackInput
          ?? result?.sourceUrl
          ?? ''
        ).trim().toLowerCase();
        if (!key || seen.has(key)) {
          continue;
        }
        seen.add(key);
        candidates.push({
          ...result,
          metadata: {
            ...result?.metadata,
            resolvedBy: result?.metadata?.resolvedBy ?? `search:${batch.source}`,
            searchQuery: query
          }
        });
      }
    }
  }

  const ranked = rankProviderUrlFallbackCandidates(providerMetadata, providerSource, candidates);
  const best = ranked[0];
  if (!best) {
    return null;
  }

  const minimumScore = providerMetadata.author ? 72 : 55;
  return best.score >= minimumScore ? best.candidate : null;
}

function buildYouTubeUrlFallbackQueries(videoMetadata) {
  const title = String(videoMetadata?.title ?? '').trim();
  const author = String(videoMetadata?.author ?? '').trim();

  return [...new Set(
    [
      author && title ? `${author} ${title}` : null,
      author && title ? `${title} ${author}` : null,
      author && title ? `"${title}" ${author}` : null,
      title,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  )];
}

function buildProviderUrlFallbackQueries(providerMetadata) {
  const title = String(providerMetadata?.title ?? '').trim();
  const author = String(providerMetadata?.author ?? '').trim();

  return [...new Set(
    [
      author && title ? `${author} ${title}` : null,
      author && title ? `${title} ${author}` : null,
      author && title ? `"${title}" ${author}` : null,
      title,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
  )];
}

function rankYouTubeUrlFallbackCandidates(videoMetadata, candidates) {
  return (candidates ?? [])
    .map((candidate, index) => ({
      candidate,
      score: scoreYouTubeUrlFallbackCandidate(videoMetadata, candidate, index),
    }))
    .sort((left, right) => right.score - left.score);
}

function rankProviderUrlFallbackCandidates(providerMetadata, providerSource, candidates) {
  return (candidates ?? [])
    .map((candidate, index) => ({
      candidate,
      score: scoreProviderUrlFallbackCandidate(providerMetadata, providerSource, candidate, index),
    }))
    .sort((left, right) => right.score - left.score);
}

function scoreYouTubeUrlFallbackCandidate(videoMetadata, candidate, index) {
  const expectedTitle = normalizeText(videoMetadata?.title);
  const expectedAuthor = normalizeText(videoMetadata?.author);
  const expectedTitleTokens = tokenize(videoMetadata?.title);
  const expectedAuthorTokens = tokenize(videoMetadata?.author);

  const candidateTitle = normalizeText(candidate?.title);
  const candidateArtist = normalizeText(candidate?.artist);
  const candidateHaystack = `${candidateTitle} ${candidateArtist}`.trim();

  const titleMatches = expectedTitleTokens.filter((token) => candidateHaystack.includes(token)).length;
  const authorMatches = expectedAuthorTokens.filter((token) => candidateHaystack.includes(token)).length;
  const exactTitleMatch = Boolean(expectedTitle && candidateTitle === expectedTitle);
  const titleContainsExpected = Boolean(expectedTitle && candidateHaystack.includes(expectedTitle));
  const exactAuthorMatch = Boolean(
    expectedAuthor
    && (
      candidateArtist === expectedAuthor
      || candidateArtist.includes(expectedAuthor)
      || expectedAuthor.includes(candidateArtist)
    )
  );

  let score = 0;

  if (exactTitleMatch) {
    score += 80;
  } else if (titleContainsExpected) {
    score += 45;
  }

  score += titleMatches * 12;

  if (expectedAuthorTokens.length > 0) {
    if (exactAuthorMatch) {
      score += 55;
    } else if (authorMatches > 0) {
      score += authorMatches * 15;
    } else {
      score -= 65;
    }
  }

  if (candidate?.metadata?.resolvedBy === 'search:youtube_music' || candidate?.metadata?.sourceName === 'youtube_music') {
    score += 12;
  } else {
    score += 6;
  }

  if (isCanonicalOriginalTrack(candidate)) {
    score += 12;
  }

  if (TOPIC_CHANNEL_PATTERN.test(candidate?.artist ?? '')) {
    score += 4;
  }

  if (MIRROR_VARIANT_PATTERNS.some((pattern) => pattern.test(candidate?.title ?? ''))) {
    score -= 70;
  }

  if ((candidate?.title ?? '').length > 100) {
    score -= 12;
  }

  score -= index * 3;

  return score;
}

function scoreProviderUrlFallbackCandidate(providerMetadata, providerSource, candidate, index) {
  const expectedTitle = normalizeText(providerMetadata?.title);
  const expectedAuthor = normalizeText(providerMetadata?.author);
  const expectedTitleTokens = tokenize(providerMetadata?.title);
  const expectedAuthorTokens = tokenize(providerMetadata?.author);

  const candidateTitle = normalizeText(candidate?.title);
  const candidateArtist = normalizeText(candidate?.artist);
  const candidateHaystack = `${candidateTitle} ${candidateArtist}`.trim();
  const candidateSource = detectMediaSource(
    candidate?.playbackInput
    ?? candidate?.sourceUrl
    ?? candidate?.metadata?.canonicalUrl
    ?? candidate?.metadata?.uri
    ?? null
  ) ?? candidate?.sourceType ?? candidate?.metadata?.sourceName ?? null;

  const titleMatches = expectedTitleTokens.filter((token) => candidateHaystack.includes(token)).length;
  const authorMatches = expectedAuthorTokens.filter((token) => candidateHaystack.includes(token)).length;
  const exactTitleMatch = Boolean(expectedTitle && candidateTitle === expectedTitle);
  const titleContainsExpected = Boolean(expectedTitle && candidateHaystack.includes(expectedTitle));
  const exactAuthorMatch = Boolean(
    expectedAuthor
    && (
      candidateArtist === expectedAuthor
      || candidateArtist.includes(expectedAuthor)
      || expectedAuthor.includes(candidateArtist)
    )
  );

  let score = 0;

  if (exactTitleMatch) {
    score += 75;
  } else if (titleContainsExpected) {
    score += 42;
  }

  score += titleMatches * 10;

  if (expectedAuthorTokens.length > 0) {
    if (exactAuthorMatch) {
      score += 45;
    } else if (authorMatches > 0) {
      score += authorMatches * 12;
    } else {
      score -= 55;
    }
  }

  if (candidateSource === providerSource) {
    score += 22;
  } else if (candidateSource === 'youtube_music') {
    score += 10;
  } else if (candidateSource === 'youtube') {
    score += 4;
  }

  if (isCanonicalOriginalTrack(candidate)) {
    score += 10;
  }

  if (MIRROR_VARIANT_PATTERNS.some((pattern) => pattern.test(candidate?.title ?? ''))) {
    score -= 70;
  }

  if ((candidate?.title ?? '').length > 100) {
    score -= 12;
  }

  score -= index * 3;

  return score;
}

function getProviderFallbackSources(providerSource) {
  switch (providerSource) {
    case 'soundcloud':
      return ['soundcloud', 'youtube_music', 'youtube'];
    case 'deezer':
      return ['deezer', 'youtube_music', 'youtube'];
    default:
      return ['youtube_music', 'youtube'];
  }
}

function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
