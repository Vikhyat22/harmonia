import test from 'node:test';
import assert from 'node:assert/strict';
import lavalinkResolver from '../src/services/lavalinkMusicResolver.js';

test('searchSpotifyRecommendations uses sprec with seed_tracks query', async () => {
  let capturedQuery = null;
  let capturedSource = null;

  lavalinkResolver.getNode = () => ({
    async search({ query, source }) {
      capturedQuery = query;
      capturedSource = source;
      return {
        tracks: [{
          info: {
            title: 'Recommended Song',
            author: 'Recommended Artist',
            identifier: 'sp-track-2',
            uri: 'https://open.spotify.com/track/sp-track-2',
            sourceName: 'spotify',
            duration: 123000,
          }
        }]
      };
    }
  });

  const results = await lavalinkResolver.searchSpotifyRecommendations(['sp-track-1'], 5);

  assert.equal(capturedQuery, 'seed_tracks=sp-track-1');
  assert.equal(capturedSource, 'sprec');
  assert.equal(results[0]?.sourceType, 'spotify');
  assert.equal(results[0]?.metadata?.identifier, 'sp-track-2');
});

test('mapLavalinkTrack preserves non-youtube provider identity for soundcloud and deezer sources', () => {
  const soundcloudTrack = lavalinkResolver.mapLavalinkTrack({
    info: {
      title: 'Track One',
      author: 'Artist One',
      identifier: 'sc-track-1',
      uri: 'https://soundcloud.com/artist-one/track-one',
      sourceName: 'soundcloud',
      duration: 123000,
    }
  }, 'soundcloud');

  const deezerTrack = lavalinkResolver.mapLavalinkTrack({
    info: {
      title: 'Track Two',
      author: 'Artist Two',
      identifier: 'dz-track-2',
      uri: 'https://www.deezer.com/track/4242',
      sourceName: 'deezer',
      duration: 124000,
    }
  }, 'deezer');

  assert.equal(soundcloudTrack.sourceType, 'soundcloud');
  assert.equal(soundcloudTrack.metadata.canonicalSourceType, 'soundcloud');
  assert.equal(deezerTrack.sourceType, 'deezer');
  assert.equal(deezerTrack.metadata.canonicalSourceType, 'deezer');
});

test('lavalink resolver detects provider short links before falling back to direct-url', () => {
  assert.equal(lavalinkResolver.detectSource('https://spotify.link/abc123'), 'spotify');
  assert.equal(lavalinkResolver.detectSource('https://on.soundcloud.com/xyz987'), 'soundcloud');
  assert.equal(lavalinkResolver.detectSource('https://deezer.page.link/qwe456'), 'deezer');
});

test('searchYouTubeRelated filters out the currently playing track', async () => {
  lavalinkResolver.getNode = () => ({
    async search() {
      return {
        tracks: [
          {
            info: {
              title: 'Current Song',
              author: 'Artist',
              identifier: 'abc123',
              uri: 'https://www.youtube.com/watch?v=abc123',
              sourceName: 'youtube',
              duration: 111000,
            }
          },
          {
            info: {
              title: 'Related Song',
              author: 'Artist',
              identifier: 'xyz999',
              uri: 'https://www.youtube.com/watch?v=xyz999',
              sourceName: 'youtube',
              duration: 112000,
            }
          }
        ]
      };
    }
  });

  const results = await lavalinkResolver.searchYouTubeRelated('abc123', 5);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.title, 'Related Song');
  assert.equal(results[0]?.metadata?.identifier, 'xyz999');
});

test('resolveTextQuery prefers the configured default search source before falling back', async () => {
  const originalSearchEngine = process.env.SEARCH_ENGINE;
  process.env.SEARCH_ENGINE = 'spsearch';

  lavalinkResolver.searchSource = async (query, source) => {
    if (source === 'spotify') {
      return [{
        title: 'Bairan',
        artist: 'Artist A',
        sourceType: 'spotify',
        playbackInput: 'https://open.spotify.com/track/abc123',
        metadata: {
          uri: 'https://open.spotify.com/track/abc123'
        }
      }];
    }

    return [{
      title: 'Bairan (Duet Version)',
      artist: 'Artist A feat. Artist B',
      sourceType: 'youtube',
      playbackInput: 'https://youtube.com/watch?v=duet',
      metadata: {}
    }];
  };

  const result = await lavalinkResolver.resolveTextQuery('bairan');

  assert.equal(result?.sourceType, 'spotify');
  assert.equal(result?.metadata?.resolvedBy, 'search:spotify');

  process.env.SEARCH_ENGINE = originalSearchEngine;
});

test('default text search sources prefer youtube music before spotify', () => {
  const originalSearchEngine = process.env.SEARCH_ENGINE;
  const originalMusicSources = process.env.MUSIC_TEXT_SEARCH_SOURCES;

  delete process.env.SEARCH_ENGINE;
  delete process.env.MUSIC_TEXT_SEARCH_SOURCES;

  const sources = lavalinkResolver.getDefaultTextSearchSources();

  assert.deepEqual(sources.slice(0, 3), ['youtube_music', 'youtube', 'spotify']);

  process.env.SEARCH_ENGINE = originalSearchEngine;
  process.env.MUSIC_TEXT_SEARCH_SOURCES = originalMusicSources;
});

test('discovery and radio text search sources expand to include soundcloud and deezer', () => {
  const originalSearchEngine = process.env.SEARCH_ENGINE;
  const originalMusicSources = process.env.MUSIC_TEXT_SEARCH_SOURCES;

  delete process.env.SEARCH_ENGINE;
  delete process.env.MUSIC_TEXT_SEARCH_SOURCES;

  const discoverySources = lavalinkResolver.getDefaultTextSearchSources({ mode: 'discovery' });
  const radioSources = lavalinkResolver.getDefaultTextSearchSources({ mode: 'radio' });
  const strictSources = lavalinkResolver.getDefaultTextSearchSources({ mode: 'strict-original' });

  assert.deepEqual(discoverySources.slice(0, 5), ['youtube_music', 'youtube', 'spotify', 'soundcloud', 'deezer']);
  assert.deepEqual(radioSources.slice(0, 5), ['youtube_music', 'youtube', 'spotify', 'soundcloud', 'deezer']);
  assert.deepEqual(strictSources.slice(0, 3), ['youtube_music', 'youtube', 'spotify']);

  process.env.SEARCH_ENGINE = originalSearchEngine;
  process.env.MUSIC_TEXT_SEARCH_SOURCES = originalMusicSources;
});

test('resolveTextQuery rejects weak text matches and falls through to the next source', async () => {
  lavalinkResolver.searchSource = async (query, source) => {
    if (source === 'spotify') {
      return [{
        title: "Mishti's happy moment",
        artist: 'Unknown Artist',
        sourceType: 'spotify',
        playbackInput: 'https://open.spotify.com/track/random',
        metadata: {
          uri: 'https://open.spotify.com/track/random'
        }
      }];
    }

    if (source === 'youtube_music') {
      return [{
        title: 'Bairan',
        artist: 'Artist A',
        sourceType: 'youtube',
        playbackInput: 'https://youtube.com/watch?v=good',
        metadata: {}
      }];
    }

    return [];
  };

  const result = await lavalinkResolver.resolveTextQuery('bairan', {
    sources: ['spotify', 'youtube_music']
  });

  assert.equal(result?.title, 'Bairan');
  assert.equal(result?.metadata?.resolvedBy, 'search:youtube_music');
});

test('resolveTextQuery can fall through to soundcloud in radio mode when core sources miss', async () => {
  lavalinkResolver.searchSource = async (query, source) => {
    if (source === 'soundcloud') {
      return [{
        title: 'Pal Pal',
        artist: 'Afusic',
        sourceType: 'soundcloud',
        playbackInput: 'https://soundcloud.com/afusic/pal-pal',
        metadata: {
          sourceName: 'soundcloud',
          canonicalSourceType: 'soundcloud'
        }
      }];
    }

    return [];
  };

  const result = await lavalinkResolver.resolveTextQuery('pal pal', {
    mode: 'radio'
  });

  assert.equal(result?.sourceType, 'soundcloud');
  assert.equal(result?.metadata?.resolvedBy, 'search:soundcloud');
});

test('resolveTextQuery returns the best text match without attaching retry candidates', async () => {
  lavalinkResolver.searchSource = async () => ([
    {
      title: 'Khat',
      artist: 'Navjot Ahuja',
      sourceType: 'youtube',
      playbackInput: 'https://youtube.com/watch?v=primary',
      metadata: { identifier: 'primary' }
    },
    {
      title: 'Khat (Audio)',
      artist: 'Navjot Ahuja',
      sourceType: 'youtube',
      playbackInput: 'https://youtube.com/watch?v=backup',
      metadata: { identifier: 'backup' }
    }
  ]);

  const result = await lavalinkResolver.resolveTextQuery('khat', {
    sources: ['youtube_music']
  });

  assert.equal(result?.title, 'Khat');
  assert.equal(result?.metadata?.retryCandidates, undefined);
});

test('text resolver demotes edited variants and rewards canonical original-style uploads', async () => {
  lavalinkResolver.searchSource = async () => ([
    {
      title: 'Tumko Dekha (Edited)',
      artist: 'Jagjit Singh',
      sourceType: 'youtube',
      playbackInput: 'https://youtube.com/watch?v=edited',
      metadata: {}
    },
    {
      title: 'Tumko Dekha To Yeh Khayal Aaya (From "Saath Saath")',
      artist: 'Jagjit Singh - Topic',
      sourceType: 'youtube',
      playbackInput: 'https://youtube.com/watch?v=canonical',
      metadata: {}
    }
  ]);

  const result = await lavalinkResolver.resolveTextQuery('tumko dekha', {
    sources: ['youtube_music']
  });

  assert.equal(result?.playbackInput, 'https://youtube.com/watch?v=canonical');
  assert.match(result?.title ?? '', /Saath Saath/);
});
