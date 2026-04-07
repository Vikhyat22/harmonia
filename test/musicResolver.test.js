import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicResolver } from '../src/services/musicResolver.js';

test('music resolver uses the Lavalink resolver for plain text queries', async () => {
  const resolver = new MusicResolver();
  let capturedQuery = null;

  resolver.getLavalinkResolver = () => ({
    async resolveTextQuery(query) {
      capturedQuery = query;
      return {
        title: 'Shape of You',
        playbackInput: 'encoded-track',
        metadata: {}
      };
    }
  });

  const result = await resolver.resolve('shape of you');

  assert.equal(capturedQuery, 'shape of you');
  assert.equal(result.title, 'Shape of You');
  assert.equal(result.playbackInput, 'encoded-track');
});

test('music resolver normalizes youtube share urls before resolving', async () => {
  const resolver = new MusicResolver();
  let capturedQuery = null;

  resolver.getLavalinkResolver = () => ({
    async resolve(query) {
      capturedQuery = query;
      return {
        title: 'Share URL Song',
        playbackInput: 'encoded-track',
        metadata: {}
      };
    }
  });

  await resolver.resolve('https://youtu.be/abc123?si=xyz');

  assert.equal(capturedQuery, 'https://www.youtube.com/watch?v=abc123');
});

test('music resolver keeps youtu.be playlist video links on the single-track path', async () => {
  const resolver = new MusicResolver();
  let capturedQuery = null;

  resolver.getLavalinkResolver = () => ({
    async resolve(query) {
      capturedQuery = query;
      return {
        title: 'Playlist Video Song',
        playbackInput: 'encoded-track',
        metadata: {}
      };
    }
  });

  await resolver.resolve('https://youtu.be/abc123?list=PLxyz&si=share');

  assert.equal(capturedQuery, 'https://www.youtube.com/watch?v=abc123&list=PLxyz');
});

test('music resolver normalizes youtube shorts urls before resolving', async () => {
  const resolver = new MusicResolver();
  let capturedQuery = null;

  resolver.getLavalinkResolver = () => ({
    async resolve(query) {
      capturedQuery = query;
      return {
        title: 'Shorts Song',
        playbackInput: 'encoded-track',
        metadata: {}
      };
    }
  });

  await resolver.resolve('https://www.youtube.com/shorts/abc123?feature=share');

  assert.equal(capturedQuery, 'https://www.youtube.com/watch?v=abc123');
});

test('music resolver normalizes youtube live urls before resolving', async () => {
  const resolver = new MusicResolver();
  let capturedQuery = null;

  resolver.getLavalinkResolver = () => ({
    async resolve(query) {
      capturedQuery = query;
      return {
        title: 'Live URL Song',
        playbackInput: 'encoded-track',
        metadata: {}
      };
    }
  });

  await resolver.resolve('https://www.youtube.com/live/abc123?feature=share');

  assert.equal(capturedQuery, 'https://www.youtube.com/watch?v=abc123');
});

test('music resolver falls back to title-based search when a youtube url is blocked by lavalink', async () => {
  const resolver = new MusicResolver();
  const originalFetch = global.fetch;
  let capturedQuery = null;
  let capturedSources = null;

  global.fetch = async () => ({
    ok: true,
    async json() {
      return { title: 'Blocked Video Title' };
    }
  });

  resolver.getLavalinkResolver = () => ({
    async resolve() {
      return null;
    },
    async resolveTextQuery(query, context) {
      capturedQuery = query;
      capturedSources = context.sources;
      return {
        title: 'Recovered Song',
        artist: 'Recovered Artist',
        sourceType: 'youtube',
        playbackInput: 'https://youtube.com/watch?v=fallback',
        metadata: {
          resolvedBy: 'search:youtube_music'
        }
      };
    }
  });

  const result = await resolver.resolve('https://www.youtube.com/watch?v=zJ0KO4Kec3w');

  global.fetch = originalFetch;

  assert.equal(capturedQuery, 'Blocked Video Title');
  assert.deepEqual(capturedSources, ['youtube_music', 'youtube']);
  assert.equal(result.title, 'Recovered Song');
  assert.equal(result.metadata.originalUrl, 'https://www.youtube.com/watch?v=zJ0KO4Kec3w');
  assert.equal(result.metadata.canonicalUrl, 'https://www.youtube.com/watch?v=zJ0KO4Kec3w');
  assert.equal(result.metadata.autoplaySeedType, 'youtube');
  assert.equal(result.metadata.resolvedBy, 'search:youtube_music:url-fallback');
});

test('music resolver uses youtube oembed author metadata to recover blocked youtube music urls with ambiguous titles', async () => {
  const resolver = new MusicResolver();
  const originalFetch = global.fetch;
  const capturedQueries = [];

  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        title: 'Google Pay',
        author_name: 'Original Artist'
      };
    }
  });

  resolver.getLavalinkResolver = () => ({
    async resolve() {
      return null;
    },
    async searchYouTubeMusic(query) {
      capturedQueries.push(['ytm', query]);
      if (query === 'Original Artist Google Pay') {
        return [
          {
            title: 'Google Pay',
            artist: 'Original Artist',
            sourceType: 'youtube_music',
            playbackInput: 'https://youtube.com/watch?v=correct123',
            metadata: {
              identifier: 'correct123',
              sourceName: 'youtube_music'
            }
          }
        ];
      }

      if (query === 'Google Pay') {
        return [
          {
            title: 'Google Pay',
            artist: 'Different Artist',
            sourceType: 'youtube_music',
            playbackInput: 'https://youtube.com/watch?v=wrong123',
            metadata: {
              identifier: 'wrong123',
              sourceName: 'youtube_music'
            }
          }
        ];
      }

      return [];
    },
    async searchYouTube(query) {
      capturedQueries.push(['yt', query]);
      return [];
    },
    async resolveTextQuery() {
      throw new Error('should not fall back to generic title-only recovery');
    }
  });

  const result = await resolver.resolve('https://music.youtube.com/watch?v=e7Oy127kmwg&si=share');

  global.fetch = originalFetch;

  assert.ok(capturedQueries.some(([, query]) => query === 'Original Artist Google Pay'));
  assert.equal(result.title, 'Google Pay');
  assert.equal(result.artist, 'Original Artist');
  assert.equal(result.playbackInput, 'https://youtube.com/watch?v=correct123');
  assert.equal(result.metadata.originalTitle, 'Google Pay');
  assert.equal(result.metadata.originalAuthor, 'Original Artist');
  assert.equal(result.metadata.autoplaySeedType, 'youtube');
  assert.equal(result.metadata.resolvedBy, 'search:youtube_music:url-fallback');
});

test('music resolver expands spotify short links before routing through the spotify mirror path', async () => {
  const resolver = new MusicResolver();
  const originalFetch = global.fetch;
  let capturedQuery = null;
  let capturedSource = null;

  global.fetch = async () => ({
    url: 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3?si=share'
  });

  resolver.getLavalinkResolver = () => ({
    async resolve(query, source) {
      capturedQuery = query;
      capturedSource = source;
      return {
        title: 'Shape of You',
        artist: 'Ed Sheeran',
        durationMs: 233000,
        sourceType: 'spotify',
        playbackInput: query,
        metadata: {
          spotifyUri: query,
          spotifyTrackId: '7qiZfU4dY1lWllzX7mPBI3'
        }
      };
    }
  });
  resolver.resolveSpotifyTrackMirror = async (track) => track;

  const result = await resolver.resolve('https://spotify.link/shape-share');

  global.fetch = originalFetch;

  assert.equal(capturedQuery, 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3?si=share');
  assert.equal(capturedSource, 'spotify');
  assert.equal(result.metadata.spotifyTrackId, '7qiZfU4dY1lWllzX7mPBI3');
});

test('music resolver recovers a failed soundcloud url through provider-aware fallback before generic youtube drift', async () => {
  const resolver = new MusicResolver();
  const originalFetch = global.fetch;
  const capturedSearches = [];

  global.fetch = async (url) => {
    if (String(url).includes('soundcloud.com/oembed')) {
      return {
        ok: true,
        async json() {
          return {
            title: 'Pal Pal',
            author_name: 'Afusic'
          };
        }
      };
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  resolver.getLavalinkResolver = () => ({
    async resolve() {
      return null;
    },
    async searchSource(query, source) {
      capturedSearches.push({ query, source });
      if (source === 'soundcloud' && query === 'Afusic Pal Pal') {
        return [{
          title: 'Pal Pal',
          artist: 'Afusic',
          sourceType: 'soundcloud',
          playbackInput: 'https://soundcloud.com/afusic/pal-pal',
          metadata: {
            identifier: 'sc-pal-pal',
            sourceName: 'soundcloud',
            canonicalSourceType: 'soundcloud'
          }
        }];
      }

      if (source === 'youtube_music') {
        return [{
          title: 'Pal Pal (Official Music Video)',
          artist: 'Afusic',
          sourceType: 'youtube_music',
          playbackInput: 'https://www.youtube.com/watch?v=yt-pal-pal',
          metadata: {
            identifier: 'yt-pal-pal',
            sourceName: 'youtube_music',
            canonicalSourceType: 'youtube_music'
          }
        }];
      }

      return [];
    }
  });

  const result = await resolver.resolve('https://soundcloud.com/afusic/pal-pal');

  global.fetch = originalFetch;

  assert.equal(result.sourceType, 'soundcloud');
  assert.equal(result.playbackInput, 'https://soundcloud.com/afusic/pal-pal');
  assert.equal(result.metadata.originalTitle, 'Pal Pal');
  assert.equal(result.metadata.originalAuthor, 'Afusic');
  assert.equal(result.metadata.autoplaySeedType, 'soundcloud');
  assert.equal(result.metadata.resolvedBy, 'search:soundcloud:url-fallback');
  assert.ok(capturedSearches.some(({ source, query }) => source === 'soundcloud' && query === 'Afusic Pal Pal'));
});

test('music resolver recovers a failed deezer url through provider-aware fallback before generic youtube drift', async () => {
  const resolver = new MusicResolver();
  const originalFetch = global.fetch;
  const capturedSearches = [];

  global.fetch = async (url) => {
    if (String(url).includes('api.deezer.com/track/42424242')) {
      return {
        ok: true,
        async json() {
          return {
            title: 'Makhna',
            artist: { name: 'Asees Kaur' }
          };
        }
      };
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  resolver.getLavalinkResolver = () => ({
    async resolve() {
      return null;
    },
    async searchSource(query, source) {
      capturedSearches.push({ query, source });
      if (source === 'deezer' && query === 'Asees Kaur Makhna') {
        return [{
          title: 'Makhna',
          artist: 'Asees Kaur',
          sourceType: 'deezer',
          playbackInput: 'https://www.deezer.com/track/42424242',
          metadata: {
            identifier: '42424242',
            sourceName: 'deezer',
            canonicalSourceType: 'deezer'
          }
        }];
      }

      if (source === 'youtube_music') {
        return [{
          title: 'Makhna (Official Video)',
          artist: 'Asees Kaur',
          sourceType: 'youtube_music',
          playbackInput: 'https://www.youtube.com/watch?v=yt-makhna',
          metadata: {
            identifier: 'yt-makhna',
            sourceName: 'youtube_music',
            canonicalSourceType: 'youtube_music'
          }
        }];
      }

      return [];
    }
  });

  const result = await resolver.resolve('https://www.deezer.com/track/42424242');

  global.fetch = originalFetch;

  assert.equal(result.sourceType, 'deezer');
  assert.equal(result.playbackInput, 'https://www.deezer.com/track/42424242');
  assert.equal(result.metadata.originalTitle, 'Makhna');
  assert.equal(result.metadata.originalAuthor, 'Asees Kaur');
  assert.equal(result.metadata.autoplaySeedType, 'deezer');
  assert.equal(result.metadata.resolvedBy, 'search:deezer:url-fallback');
  assert.ok(capturedSearches.some(({ source, query }) => source === 'deezer' && query === 'Asees Kaur Makhna'));
});

test('music resolver falls back to direct url handling when Lavalink returns nothing', async () => {
  const resolver = new MusicResolver();

  resolver.getLavalinkResolver = () => ({
    async resolve() {
      return null;
    }
  });

  const result = await resolver.resolve('https://example.com/audio/test-track.mp3');

  assert.equal(result.title, 'test track');
  assert.equal(result.playbackInput, 'https://example.com/audio/test-track.mp3');
  assert.equal(result.sourceType, 'direct-url');
});

test('music resolver prefers stronger spotify matches over generic youtube results for text queries', async () => {
  const resolver = new MusicResolver();

  resolver.getLavalinkResolver = () => ({
    async resolveTextQuery() {
      return {
        title: 'Sanson Ki Mala',
        artist: 'Rahat Fateh Ali Khan',
        durationMs: 285000,
        sourceType: 'spotify',
        playbackInput: 'https://open.spotify.com/track/abc123',
        metadata: {
          resolvedBy: 'search:spotify',
          uri: 'https://open.spotify.com/track/abc123'
        }
      };
    }
  });

  const result = await resolver.resolve('sanson ki mala');

  assert.equal(result.title, 'Sanson Ki Mala');
  assert.equal(result.artist, 'Rahat Fateh Ali Khan');
  assert.equal(result.sourceType, 'spotify');
  assert.equal(result.metadata.resolvedBy, 'search:spotify');
  assert.equal(result.metadata.spotifyTrackId, 'abc123');
  assert.equal(result.metadata.canonicalUrl, 'https://open.spotify.com/track/abc123');
});

test('music resolver uses a verified youtube mirror for direct spotify track urls', async () => {
  const resolver = new MusicResolver();
  const capturedQueries = [];
  const originalFetch = global.fetch;
  const originalClientId = process.env.SPOTIFY_CLIENT_ID;
  const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  process.env.SPOTIFY_CLIENT_ID = '';
  process.env.SPOTIFY_CLIENT_SECRET = '';
  global.fetch = async () => ({
    ok: true,
    async text() {
      return '<html></html>';
    }
  });

  resolver.getLavalinkResolver = () => ({
    async resolve() {
      return {
        title: 'Shikayat',
        artist: 'AUR',
        durationMs: 270000,
        sourceType: 'spotify',
        playbackInput: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
        metadata: {
          lavalinkTrack: { id: 'spotify-track' },
          resolvedBy: 'spotify-url',
          uri: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1'
        }
      };
    },
    async searchYouTubeMusic(query) {
      capturedQueries.push(['ytm', query]);
      return [];
    },
    async searchYouTube(query) {
      capturedQueries.push(['yt', query]);
      return [
        {
          title: 'Shikayat (Official Audio)',
          artist: 'AUR',
          durationMs: 271000,
          sourceType: 'youtube',
          playbackInput: 'https://www.youtube.com/watch?v=mirror123',
          metadata: {
            lavalinkTrack: { id: 'youtube-mirror-track' },
            identifier: 'mirror123',
            sourceName: 'youtube'
          }
        }
      ];
    }
  });

  const result = await resolver.resolve('https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1?si=abc');

  global.fetch = originalFetch;
  process.env.SPOTIFY_CLIENT_ID = originalClientId;
  process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;

  assert.deepEqual(capturedQueries, [
    ['ytm', 'AUR Shikayat'],
    ['yt', 'AUR Shikayat']
  ]);
  assert.equal(result.title, 'Shikayat');
  assert.equal(result.artist, 'AUR');
  assert.equal(result.playbackInput, 'https://www.youtube.com/watch?v=mirror123');
  assert.equal(result.sourceType, 'spotify');
  assert.equal(result.metadata.spotifyTrackId, '7e2dvR0ySx1bBJRDxVJiG1');
  assert.equal(result.metadata.sourceName, 'youtube');
  assert.equal(result.metadata.mirrorTitle, 'Shikayat (Official Audio)');
  assert.deepEqual(result.metadata.originalSpotifyTrack, { id: 'spotify-track' });
  assert.deepEqual(result.metadata.lavalinkTrack, { id: 'youtube-mirror-track' });
  assert.equal(result.metadata.resolvedBy, 'spotify-url:youtube-mirror');
});

test('music resolver rejects direct spotify track urls when only mismatched mirrors are found', async () => {
  const resolver = new MusicResolver();
  const originalFetch = global.fetch;
  const originalClientId = process.env.SPOTIFY_CLIENT_ID;
  const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  process.env.SPOTIFY_CLIENT_ID = '';
  process.env.SPOTIFY_CLIENT_SECRET = '';

  global.fetch = async () => ({
    ok: true,
    async text() {
      return '<html></html>';
    }
  });

  resolver.getLavalinkResolver = () => ({
    async resolve() {
      return {
        title: 'Shikayat',
        artist: 'AUR',
        durationMs: 270000,
        sourceType: 'spotify',
        playbackInput: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
        metadata: {
          resolvedBy: 'spotify-url',
          uri: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1'
        }
      };
    },
    async searchYouTubeMusic() {
      return [
        {
          title: 'Shikayat',
          artist: 'Archana Gore',
          durationMs: 250000,
          sourceType: 'youtube',
          playbackInput: 'https://www.youtube.com/watch?v=wrong123',
          metadata: {
            identifier: 'wrong123',
            sourceName: 'youtube'
          }
        }
      ];
    },
    async searchYouTube() {
      return [];
    }
  });

  await assert.rejects(
    () => resolver.resolve('https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1?si=abc'),
    /could not verify a playable mirror/i
  );

  global.fetch = originalFetch;
  process.env.SPOTIFY_CLIENT_ID = originalClientId;
  process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;
});

test('music resolver can verify a spotify mirror through ISRC details when search artist metadata is noisy', async () => {
  const resolver = new MusicResolver();
  const originalFetch = global.fetch;
  const originalClientId = process.env.SPOTIFY_CLIENT_ID;
  const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const capturedQueries = [];

  process.env.SPOTIFY_CLIENT_ID = 'spotify-client';
  process.env.SPOTIFY_CLIENT_SECRET = 'spotify-secret';

  global.fetch = async (url) => {
    if (String(url).includes('accounts.spotify.com/api/token')) {
      return {
        ok: true,
        async json() {
          return { access_token: 'token', expires_in: 3600 };
        }
      };
    }

    if (String(url).includes('/v1/tracks/7e2dvR0ySx1bBJRDxVJiG1')) {
      return {
        ok: true,
        async json() {
          return {
            name: 'Shikayat',
            uri: 'spotify:track:7e2dvR0ySx1bBJRDxVJiG1',
            duration_ms: 270000,
            external_ids: { isrc: 'AQA1B2345678' },
            artists: [{ name: 'AUR' }],
            album: { name: 'Shikayat' }
          };
        }
      };
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  resolver.getLavalinkResolver = () => ({
    async resolve() {
      return {
        title: 'Shikayat',
        artist: 'AUR',
        durationMs: 270000,
        sourceType: 'spotify',
        playbackInput: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
        metadata: {
          lavalinkTrack: { id: 'spotify-track' },
          resolvedBy: 'spotify-url',
          uri: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1'
        }
      };
    },
    async searchYouTubeMusic(query) {
      capturedQueries.push(['ytm', query]);
      if (query === 'AQA1B2345678') {
        return [
          {
            title: 'Shikayat (Official Audio)',
            artist: 'Sony Music India',
            durationMs: 271000,
            sourceType: 'youtube',
            playbackInput: 'https://www.youtube.com/watch?v=isrc123',
            metadata: {
              lavalinkTrack: { id: 'youtube-isrc-track' },
              identifier: 'isrc123',
              sourceName: 'youtube'
            }
          }
        ];
      }
      return [];
    },
    async searchYouTube(query) {
      capturedQueries.push(['yt', query]);
      return [];
    }
  });

  const result = await resolver.resolve('https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1?si=abc');

  global.fetch = originalFetch;
  process.env.SPOTIFY_CLIENT_ID = originalClientId;
  process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;

  assert.deepEqual(capturedQueries.slice(0, 2), [
    ['ytm', 'AQA1B2345678'],
    ['yt', 'AQA1B2345678']
  ]);
  assert.equal(result.playbackInput, 'https://www.youtube.com/watch?v=isrc123');
  assert.equal(result.metadata.spotifyIsrc, 'AQA1B2345678');
  assert.deepEqual(result.metadata.lavalinkTrack, { id: 'youtube-isrc-track' });
});

test('music resolver falls back to youtube web search when lavalink search misses a spotify mirror', async () => {
  const resolver = new MusicResolver();
  const originalFetch = global.fetch;
  const originalClientId = process.env.SPOTIFY_CLIENT_ID;
  const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  process.env.SPOTIFY_CLIENT_ID = 'spotify-client';
  process.env.SPOTIFY_CLIENT_SECRET = 'spotify-secret';

  const webInitialData = {
    contents: [
      {
        videoRenderer: {
          videoId: 'QxddU3sjVRY',
          title: { runs: [{ text: 'Shikayat by AUR | شکایت  (Official Music Video)' }] },
          ownerText: { runs: [{ text: 'AUR' }] },
          lengthText: { simpleText: '4:33' },
          viewCountText: { simpleText: '109,088,645 views' }
        }
      }
    ]
  };

  global.fetch = async (url) => {
    const stringUrl = String(url);

    if (stringUrl.includes('accounts.spotify.com/api/token')) {
      return {
        ok: true,
        async json() {
          return { access_token: 'token', expires_in: 3600 };
        }
      };
    }

    if (stringUrl.includes('/v1/tracks/7e2dvR0ySx1bBJRDxVJiG1')) {
      return {
        ok: true,
        async json() {
          return {
            name: 'Shikayat',
            uri: 'spotify:track:7e2dvR0ySx1bBJRDxVJiG1',
            duration_ms: 270000,
            external_ids: { isrc: 'AEA182300057' },
            artists: [{ name: 'AUR' }],
            album: { name: 'Shikayat' }
          };
        }
      };
    }

    if (stringUrl.startsWith('https://www.youtube.com/results?')) {
      return {
        ok: true,
        async text() {
          return `<html><head><script>var ytInitialData = ${JSON.stringify(webInitialData)};</script></head></html>`;
        }
      };
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  resolver.getLavalinkResolver = () => ({
    async resolve(query) {
      if (String(query).includes('open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1')) {
        return {
          title: 'Shikayat',
          artist: 'AUR',
          durationMs: 270000,
          sourceType: 'spotify',
          playbackInput: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
          metadata: {
            lavalinkTrack: { id: 'spotify-track' },
            resolvedBy: 'spotify-url',
            uri: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1'
          }
        };
      }

      if (query === 'https://www.youtube.com/watch?v=QxddU3sjVRY') {
        return {
          title: 'Shikayat by AUR | شکایت  (Official Music Video)',
          artist: 'AUR',
          durationMs: 273000,
          sourceType: 'youtube',
          playbackInput: 'https://www.youtube.com/watch?v=QxddU3sjVRY',
          metadata: {
            lavalinkTrack: { id: 'youtube-web-track' },
            identifier: 'QxddU3sjVRY',
            sourceName: 'youtube',
            uri: 'https://www.youtube.com/watch?v=QxddU3sjVRY'
          }
        };
      }

      return null;
    },
    async searchYouTubeMusic() {
      return [];
    },
    async searchYouTube() {
      return [];
    }
  });

  const result = await resolver.resolve('https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1?si=abc');

  global.fetch = originalFetch;
  process.env.SPOTIFY_CLIENT_ID = originalClientId;
  process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;

  assert.equal(result.playbackInput, 'https://www.youtube.com/watch?v=QxddU3sjVRY');
  assert.equal(result.metadata.mirrorSourceKind, 'youtube-web-search');
  assert.equal(result.metadata.mirrorWebViews, 109088645);
  assert.deepEqual(result.metadata.lavalinkTrack, { id: 'youtube-web-track' });
});

test('music resolver prefers a high-view official web mirror over a topic upload for spotify urls', async () => {
  const resolver = new MusicResolver();
  const originalFetch = global.fetch;
  const originalClientId = process.env.SPOTIFY_CLIENT_ID;
  const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  process.env.SPOTIFY_CLIENT_ID = 'spotify-client';
  process.env.SPOTIFY_CLIENT_SECRET = 'spotify-secret';

  const webInitialData = {
    contents: [
      {
        videoRenderer: {
          videoId: 'QxddU3sjVRY',
          title: { runs: [{ text: 'Shikayat by AUR | شکایت  (Official Music Video)' }] },
          ownerText: { runs: [{ text: 'AUR' }] },
          lengthText: { simpleText: '4:33' },
          viewCountText: { simpleText: '109,088,645 views' }
        }
      }
    ]
  };

  global.fetch = async (url) => {
    const stringUrl = String(url);

    if (stringUrl.includes('accounts.spotify.com/api/token')) {
      return {
        ok: true,
        async json() {
          return { access_token: 'token', expires_in: 3600 };
        }
      };
    }

    if (stringUrl.includes('/v1/tracks/7e2dvR0ySx1bBJRDxVJiG1')) {
      return {
        ok: true,
        async json() {
          return {
            name: 'Shikayat',
            uri: 'spotify:track:7e2dvR0ySx1bBJRDxVJiG1',
            duration_ms: 270000,
            external_ids: { isrc: 'AEA182300057' },
            artists: [{ name: 'AUR' }],
            album: { name: 'Shikayat' }
          };
        }
      };
    }

    if (stringUrl.startsWith('https://www.youtube.com/results?')) {
      return {
        ok: true,
        async text() {
          return `<html><head><script>var ytInitialData = ${JSON.stringify(webInitialData)};</script></head></html>`;
        }
      };
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  resolver.getLavalinkResolver = () => ({
    async resolve(query) {
      if (String(query).includes('open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1')) {
        return {
          title: 'Shikayat',
          artist: 'AUR',
          durationMs: 270000,
          sourceType: 'spotify',
          playbackInput: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
          metadata: {
            lavalinkTrack: { id: 'spotify-track' },
            resolvedBy: 'spotify-url',
            uri: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1'
          }
        };
      }

      if (query === 'https://www.youtube.com/watch?v=QxddU3sjVRY') {
        return {
          title: 'Shikayat by AUR | شکایت  (Official Music Video)',
          artist: 'AUR',
          durationMs: 273000,
          sourceType: 'youtube',
          playbackInput: 'https://www.youtube.com/watch?v=QxddU3sjVRY',
          metadata: {
            lavalinkTrack: { id: 'youtube-official-track' },
            identifier: 'QxddU3sjVRY',
            sourceName: 'youtube',
            uri: 'https://www.youtube.com/watch?v=QxddU3sjVRY'
          }
        };
      }

      if (query === 'https://www.youtube.com/watch?v=kCgN_xD0qFY') {
        return {
          title: 'Shikayat',
          artist: 'AUR - Topic',
          durationMs: 270000,
          sourceType: 'youtube',
          playbackInput: 'https://www.youtube.com/watch?v=kCgN_xD0qFY',
          metadata: {
            lavalinkTrack: { id: 'youtube-topic-track' },
            identifier: 'kCgN_xD0qFY',
            sourceName: 'youtube',
            uri: 'https://www.youtube.com/watch?v=kCgN_xD0qFY'
          }
        };
      }

      return null;
    },
    async searchYouTubeMusic(query) {
      if (query === 'AUR Shikayat') {
        return [
          {
            title: 'Shikayat',
            artist: 'AUR - Topic',
            durationMs: 270000,
            sourceType: 'youtube',
            playbackInput: 'https://www.youtube.com/watch?v=kCgN_xD0qFY',
            metadata: {
              lavalinkTrack: { id: 'youtube-topic-track' },
              identifier: 'kCgN_xD0qFY',
              sourceName: 'youtube'
            }
          }
        ];
      }
      return [];
    },
    async searchYouTube() {
      return [];
    }
  });

  const result = await resolver.resolve('https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1?si=abc');

  global.fetch = originalFetch;
  process.env.SPOTIFY_CLIENT_ID = originalClientId;
  process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;

  assert.equal(result.playbackInput, 'https://www.youtube.com/watch?v=QxddU3sjVRY');
  assert.equal(result.metadata.mirrorSourceKind, 'youtube-web-search');
});

test('music resolver falls back to generic lavalink resolve when default text search is unavailable', async () => {
  const resolver = new MusicResolver();
  let capturedQuery = null;
  let capturedSource = null;

  resolver.getLavalinkResolver = () => ({
    async resolve(query, source) {
      capturedQuery = query;
      capturedSource = source;
      return {
        title: 'Fallback Song',
        playbackInput: 'encoded-track',
        metadata: {}
      };
    }
  });

  const result = await resolver.resolve('bairan');

  assert.equal(capturedQuery, 'bairan');
  assert.equal(capturedSource, null);
  assert.equal(result.title, 'Fallback Song');
});

test('music resolver merges web popularity into matching lavalink mirrors so official results beat topic uploads first', async () => {
  const resolver = new MusicResolver();
  const originalFetch = global.fetch;
  const originalClientId = process.env.SPOTIFY_CLIENT_ID;
  const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  process.env.SPOTIFY_CLIENT_ID = 'spotify-client';
  process.env.SPOTIFY_CLIENT_SECRET = 'spotify-secret';

  const webInitialData = {
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    {
                      videoRenderer: {
                        videoId: 'QxddU3sjVRY',
                        title: {
                          runs: [{ text: 'Shikayat by AUR | شکایت  (Official Music Video)' }]
                        },
                        ownerText: {
                          runs: [{ text: 'AUR' }]
                        },
                        lengthText: {
                          simpleText: '4:34'
                        },
                        viewCountText: {
                          simpleText: '109M views'
                        }
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    }
  };

  global.fetch = async (url) => {
    const stringUrl = String(url);

    if (stringUrl.includes('accounts.spotify.com/api/token')) {
      return {
        ok: true,
        async json() {
          return {
            access_token: 'spotify-token',
            token_type: 'Bearer',
            expires_in: 3600
          };
        }
      };
    }

    if (stringUrl.includes('/v1/tracks/7e2dvR0ySx1bBJRDxVJiG1')) {
      return {
        ok: true,
        async json() {
          return {
            name: 'Shikayat',
            uri: 'spotify:track:7e2dvR0ySx1bBJRDxVJiG1',
            duration_ms: 270000,
            external_ids: { isrc: 'AEA182300057' },
            artists: [{ name: 'AUR' }],
            album: { name: 'Shikayat' }
          };
        }
      };
    }

    if (stringUrl.startsWith('https://www.youtube.com/results?')) {
      return {
        ok: true,
        async text() {
          return `<html><head><script>var ytInitialData = ${JSON.stringify(webInitialData)};</script></head></html>`;
        }
      };
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  resolver.getLavalinkResolver = () => ({
    async resolve(query) {
      if (String(query).includes('open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1')) {
        return {
          title: 'Shikayat',
          artist: 'AUR',
          durationMs: 270000,
          sourceType: 'spotify',
          playbackInput: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
          metadata: {
            lavalinkTrack: { id: 'spotify-track' },
            resolvedBy: 'spotify-url',
            uri: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1'
          }
        };
      }

      return null;
    },
    async searchYouTubeMusic(query) {
      if (query === 'AUR Shikayat') {
        return [
          {
            title: 'Shikayat',
            artist: 'AUR - Topic',
            durationMs: 270000,
            sourceType: 'youtube',
            playbackInput: 'https://www.youtube.com/watch?v=kCgN_xD0qFY',
            metadata: {
              lavalinkTrack: { id: 'youtube-topic-track' },
              identifier: 'kCgN_xD0qFY',
              sourceName: 'youtube'
            }
          },
          {
            title: 'Shikayat by AUR | شکایت  (Official Music Video)',
            artist: 'AUR',
            durationMs: 274000,
            sourceType: 'youtube',
            playbackInput: 'https://www.youtube.com/watch?v=QxddU3sjVRY',
            metadata: {
              lavalinkTrack: { id: 'youtube-official-track' },
              identifier: 'QxddU3sjVRY',
              sourceName: 'youtube'
            }
          }
        ];
      }
      return [];
    },
    async searchYouTube() {
      return [];
    }
  });

  const result = await resolver.resolve('https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1?si=abc');

  global.fetch = originalFetch;
  process.env.SPOTIFY_CLIENT_ID = originalClientId;
  process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;

  assert.equal(result.playbackInput, 'https://www.youtube.com/watch?v=QxddU3sjVRY');
  assert.equal(result.metadata.mirrorWebViews, 109);
});

test('music resolver can hydrate an official web mirror through youtube search when direct url resolve is blocked', async () => {
  const resolver = new MusicResolver();
  const originalFetch = global.fetch;
  const originalClientId = process.env.SPOTIFY_CLIENT_ID;
  const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  process.env.SPOTIFY_CLIENT_ID = 'spotify-client';
  process.env.SPOTIFY_CLIENT_SECRET = 'spotify-secret';

  const webInitialData = {
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    {
                      videoRenderer: {
                        videoId: 'QxddU3sjVRY',
                        title: {
                          runs: [{ text: 'Shikayat by AUR | شکایت  (Official Music Video)' }]
                        },
                        ownerText: {
                          runs: [{ text: 'AUR' }]
                        },
                        lengthText: {
                          simpleText: '4:34'
                        },
                        viewCountText: {
                          simpleText: '109M views'
                        }
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      }
    }
  };

  global.fetch = async (url) => {
    const stringUrl = String(url);

    if (stringUrl.includes('accounts.spotify.com/api/token')) {
      return {
        ok: true,
        async json() {
          return {
            access_token: 'spotify-token',
            token_type: 'Bearer',
            expires_in: 3600
          };
        }
      };
    }

    if (stringUrl.includes('/v1/tracks/7e2dvR0ySx1bBJRDxVJiG1')) {
      return {
        ok: true,
        async json() {
          return {
            name: 'Shikayat',
            uri: 'spotify:track:7e2dvR0ySx1bBJRDxVJiG1',
            duration_ms: 270000,
            external_ids: { isrc: 'AEA182300057' },
            artists: [{ name: 'AUR' }],
            album: { name: 'Shikayat' }
          };
        }
      };
    }

    if (stringUrl.startsWith('https://www.youtube.com/results?')) {
      return {
        ok: true,
        async text() {
          return `<html><head><script>var ytInitialData = ${JSON.stringify(webInitialData)};</script></head></html>`;
        }
      };
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  resolver.getLavalinkResolver = () => ({
    async resolve(query) {
      if (String(query).includes('open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1')) {
        return {
          title: 'Shikayat',
          artist: 'AUR',
          durationMs: 270000,
          sourceType: 'spotify',
          playbackInput: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
          metadata: {
            lavalinkTrack: { id: 'spotify-track' },
            resolvedBy: 'spotify-url',
            uri: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1'
          }
        };
      }

      if (query === 'https://www.youtube.com/watch?v=QxddU3sjVRY') {
        return null;
      }

      return null;
    },
    async searchYouTubeMusic(query) {
      if (query === 'AUR Shikayat') {
        return [
          {
            title: 'Shikayat',
            artist: 'AUR - Topic',
            durationMs: 270000,
            sourceType: 'youtube',
            playbackInput: 'https://www.youtube.com/watch?v=kCgN_xD0qFY',
            metadata: {
              lavalinkTrack: { id: 'youtube-topic-track' },
              identifier: 'kCgN_xD0qFY',
              sourceName: 'youtube'
            }
          }
        ];
      }

      if (query === 'Shikayat by AUR | شکایت  (Official Music Video)') {
        return [
          {
            title: 'Shikayat by AUR | شکایت  (Official Music Video)',
            artist: 'AUR',
            durationMs: 274000,
            sourceType: 'youtube',
            playbackInput: 'https://www.youtube.com/watch?v=QxddU3sjVRY',
            metadata: {
              lavalinkTrack: { id: 'youtube-official-track' },
              identifier: 'QxddU3sjVRY',
              sourceName: 'youtube'
            }
          }
        ];
      }

      return [];
    },
    async searchYouTube() {
      return [];
    }
  });

  const result = await resolver.resolve('https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1?si=abc');

  global.fetch = originalFetch;
  process.env.SPOTIFY_CLIENT_ID = originalClientId;
  process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;

  assert.equal(result.playbackInput, 'https://www.youtube.com/watch?v=QxddU3sjVRY');
  assert.deepEqual(result.metadata.lavalinkTrack, { id: 'youtube-official-track' });
  assert.equal(result.metadata.mirrorSourceKind, 'youtube-web-search');
});

test('music resolver rejects weak random text matches instead of returning junk', async () => {
  const resolver = new MusicResolver();

  resolver.getLavalinkResolver = () => ({
    async resolveTextQuery() {
      return null;
    },
    async resolve() {
      return null;
    }
  });

  await assert.rejects(
    () => resolver.resolve('bairan'),
    /unable to resolve this music source/i
  );
});
