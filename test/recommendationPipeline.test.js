import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildRecommendationSeeds,
  evaluateRecommendationPool,
  getRecommendationForSeed,
  getTrackAlbum
} from '../src/services/recommendationPipeline.js';
import lavalinkResolver from '../src/services/lavalinkMusicResolver.js';

test('recommendation pipeline builds normalized recommendation seeds with canonical identity and mode', () => {
  const seeds = buildRecommendationSeeds({
    guildId: 'guild-1',
    mode: 'discovery',
    lastItem: {
      kind: 'music',
      source: 'slash',
      title: 'Shape of You',
      artist: 'Ed Sheeran',
      durationMs: 233000,
      sourceType: 'spotify',
      playbackInput: 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3',
      metadata: {
        spotifyTrackId: '7qiZfU4dY1lWllzX7mPBI3',
        spotifyUri: 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3',
        spotifyAlbum: 'Divide'
      }
    },
    anchorSeed: null,
    historyTracks: []
  });

  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].guildId, 'guild-1');
  assert.equal(seeds[0].mode, 'discovery');
  assert.equal(seeds[0].title, 'Shape of You');
  assert.equal(seeds[0].artist, 'Ed Sheeran');
  assert.equal(seeds[0].album, 'Divide');
  assert.equal(seeds[0].spotifyTrackId, '7qiZfU4dY1lWllzX7mPBI3');
  assert.match(seeds[0].canonicalKey, /^spotify:/);
});

test('recommendation pipeline classifies text-resolved tracks as text seeds while preserving provider identity', () => {
  const seeds = buildRecommendationSeeds({
    guildId: 'guild-text-seed',
    mode: 'strict-original',
    lastItem: {
      kind: 'music',
      source: 'slash',
      title: 'Bahut Pyar Karte Hai - Male Version',
      artist: 'S. P. Balasubrahmanyam',
      durationMs: 235000,
      sourceType: 'spotify',
      playbackInput: 'https://open.spotify.com/track/6yTtUUlsBXN9h9ZxTxGWMS',
      metadata: {
        spotifyTrackId: '6yTtUUlsBXN9h9ZxTxGWMS',
        spotifyUri: 'https://open.spotify.com/track/6yTtUUlsBXN9h9ZxTxGWMS',
        sourceName: 'spotify',
        canonicalSourceType: 'spotify',
        resolvedBy: 'search:spotify',
        autoplaySeedType: 'text'
      }
    },
    anchorSeed: null,
    historyTracks: []
  });

  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].sourceType, 'text');
  assert.equal(seeds[0].providerSourceType, 'spotify');
});

test('recommendation pipeline keeps url-fallback search recoveries on their canonical provider seed type', () => {
  const seeds = buildRecommendationSeeds({
    guildId: 'guild-url-fallback-seed',
    mode: 'strict-original',
    lastItem: {
      kind: 'music',
      source: 'slash',
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      durationMs: 263000,
      sourceType: 'youtube_music',
      playbackInput: 'https://www.youtube.com/watch?v=BjL7AuPsmEk',
      metadata: {
        identifier: 'BjL7AuPsmEk',
        sourceName: 'youtube_music',
        canonicalSourceType: 'youtube',
        resolvedBy: 'search:youtube_music:url-fallback',
        canonicalUrl: 'https://www.youtube.com/watch?v=fsiPzT50ZiM',
        originalUrl: 'https://www.youtube.com/watch?v=fsiPzT50ZiM'
      }
    },
    anchorSeed: null,
    historyTracks: []
  });

  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].sourceType, 'youtube');
  assert.equal(seeds[0].providerSourceType, 'youtube');
});

test('recommendation pipeline prioritizes the current autoplay track before the original anchor seed', () => {
  const seeds = buildRecommendationSeeds({
    guildId: 'guild-autoplay-frontier',
    mode: 'strict-original',
    lastItem: {
      kind: 'music',
      source: 'autoplay',
      title: 'Ae Dil Hai Mushkil',
      artist: 'Pritam',
      durationMs: 264000,
      sourceType: 'youtube',
      playbackInput: 'https://www.youtube.com/watch?v=wx89ZdkwtS8',
      metadata: {
        identifier: 'wx89ZdkwtS8',
        sourceName: 'youtube',
        canonicalSourceType: 'youtube',
        autoplaySeed: {
          title: 'Tum Hi Ho',
          artist: 'Arijit Singh',
          playbackInput: 'https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di',
          sourceType: 'spotify',
          providerSourceType: 'spotify',
          spotifyTrackId: '56zZ48jdyY2oDXHVnwg5Di'
        }
      }
    },
    anchorSeed: {
      kind: 'music',
      source: 'slash',
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      durationMs: 262000,
      sourceType: 'spotify',
      playbackInput: 'https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di',
      metadata: {
        spotifyTrackId: '56zZ48jdyY2oDXHVnwg5Di',
        spotifyUri: 'https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di',
        sourceName: 'spotify',
        canonicalSourceType: 'spotify'
      }
    },
    historyTracks: []
  });

  assert.equal(seeds[0].title, 'Ae Dil Hai Mushkil');
  assert.equal(seeds[0].artist, 'Pritam');
  assert.equal(seeds[1].title, 'Tum Hi Ho');
  assert.equal(seeds[1].artist, 'Arijit Singh');
});

test('strict-original recovered url-fallback seeds prefer a strong non-seed-artist related continuation after one same-artist pick', () => {
  const [seed] = buildRecommendationSeeds({
    guildId: 'guild-url-fallback-same-artist',
    mode: 'strict-original',
    lastItem: {
      kind: 'music',
      source: 'slash',
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      durationMs: 263000,
      sourceType: 'youtube_music',
      playbackInput: 'https://www.youtube.com/watch?v=BjL7AuPsmEk',
      metadata: {
        identifier: 'BjL7AuPsmEk',
        sourceName: 'youtube_music',
        canonicalSourceType: 'youtube',
        resolvedBy: 'search:youtube_music:url-fallback',
        originalUrl: 'https://www.youtube.com/watch?v=fsiPzT50ZiM'
      }
    },
    anchorSeed: null,
    historyTracks: []
  });

  const result = evaluateRecommendationPool({
    seed,
    candidates: [
      {
        title: 'Khairiyat (Bonus Track)',
        artist: 'Arijit Singh',
        durationMs: 266000,
        sourceType: 'youtube',
        playbackInput: 'https://www.youtube.com/watch?v=q3HNo5a3ol4',
        metadata: {
          identifier: 'q3HNo5a3ol4',
          sourceName: 'youtube',
          canonicalSourceType: 'youtube'
        }
      },
      {
        title: 'Ae Dil Hai Mushkil Title Track (From "Ae Dil Hai Mushkil")',
        artist: 'Pritam',
        durationMs: 264000,
        sourceType: 'youtube',
        playbackInput: 'https://www.youtube.com/watch?v=aedil123',
        metadata: {
          identifier: 'aedil123',
          sourceName: 'youtube',
          canonicalSourceType: 'youtube'
        }
      }
    ],
    provenance: {
      source: 'yt-related',
      query: 'BjL7AuPsmEk',
      rank: 0
    },
    recentCanonicalKeys: [],
    recentTracks: [],
    recentAutoplayArtists: ['arijit singh'],
    memoryContext: {}
  });

  assert.equal(result.winner?.track?.title, 'Ae Dil Hai Mushkil Title Track (From "Ae Dil Hai Mushkil")');
});

test('strict-original spotify seeds prefer a strong non-seed-artist related continuation after one same-artist pick', () => {
  const seed = buildRecommendationSeeds({
    guildId: 'guild-spotify-same-artist',
    mode: 'strict-original',
    lastItem: {
      kind: 'music',
      source: 'slash',
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      durationMs: 263000,
      sourceType: 'spotify',
      playbackInput: 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3',
      metadata: {
        spotifyTrackId: '7qiZfU4dY1lWllzX7mPBI3',
        spotifyUri: 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3',
        sourceName: 'spotify',
        canonicalSourceType: 'spotify'
      }
    },
    anchorSeed: null,
    historyTracks: []
  })[0];

  const result = evaluateRecommendationPool({
    seed,
    candidates: [
      {
        title: 'Khairiyat',
        artist: 'Arijit Singh',
        durationMs: 270000,
        sourceType: 'spotify',
        playbackInput: 'https://open.spotify.com/track/1234567890123456789012',
        metadata: {
          spotifyTrackId: '1234567890123456789012',
          spotifyUri: 'https://open.spotify.com/track/1234567890123456789012',
          sourceName: 'spotify',
          canonicalSourceType: 'spotify'
        }
      },
      {
        title: 'Ae Dil Hai Mushkil',
        artist: 'Pritam',
        durationMs: 264000,
        sourceType: 'youtube',
        playbackInput: 'https://www.youtube.com/watch?v=spotify-aedil123',
        metadata: {
          identifier: 'spotify-aedil123',
          sourceName: 'youtube',
          canonicalSourceType: 'youtube'
        }
      }
    ],
    provenance: {
      source: 'yt-related',
      query: 'spotify-seed-mirror',
      rank: 0
    },
    recentCanonicalKeys: [],
    recentTracks: [],
    recentAutoplayArtists: ['arijit singh'],
    memoryContext: {}
  });

  assert.equal(result.winner?.track?.title, 'Ae Dil Hai Mushkil');
});

test('autoplay service delegates recommendation work to the pipeline module', async () => {
  const source = await readFile(new URL('../src/services/autoplay.js', import.meta.url), 'utf8');

  assert.match(source, /buildRecommendationSeeds/);
  assert.match(source, /getRecommendationForSeed/);
  assert.doesNotMatch(source, /async function getRecommendation\(/);
  assert.doesNotMatch(source, /function rankAutoplayCandidates\(/);
});

test('recommendation pipeline uses canonical-key memory to reject recent, skipped, and failed candidates', async () => {
  const source = await readFile(new URL('../src/services/recommendationPipeline.js', import.meta.url), 'utf8');

  assert.match(source, /memoryContext/);
  assert.match(source, /recentCanonicalSet/);
  assert.match(source, /skippedCanonicalSet/);
  assert.match(source, /failedCanonicalSet/);
  assert.match(source, /skipped_recently/);
  assert.match(source, /failed_recently/);
});

test('recommendation pipeline attaches a structured autoplay debug trace to the selected track', async () => {
  const source = await readFile(new URL('../src/services/recommendationPipeline.js', import.meta.url), 'utf8');

  assert.match(source, /autoplayDebugTrace/);
  assert.match(source, /buildAutoplayDebugTrace/);
  assert.match(source, /rejectedTopCandidates/);
  assert.match(source, /reasonSummary/);
});

test('recommendation pipeline ignores youtube album metadata for autoplay album matching', () => {
  const album = getTrackAlbum({
    title: 'Google Pay',
    artist: 'Karma',
    sourceType: 'youtube_music',
    metadata: {
      identifier: 'seed-google-pay',
      sourceName: 'youtube_music',
      canonicalSourceType: 'youtube_music',
      lavalinkTrack: {
        pluginInfo: {
          albumName: 'Google Pay'
        }
      }
    }
  });

  assert.equal(album, null);
});

test('soundcloud seeds prefer soundcloud catalog candidates before generic youtube fallbacks', async () => {
  const originalSearchSource = lavalinkResolver.searchSource;
  const calls = [];

  lavalinkResolver.searchSource = async (query, source) => {
    calls.push({ query, source });

    if (source === 'soundcloud') {
      return [{
        title: 'Not Enough',
        artist: 'Afusic',
        durationMs: 191000,
        sourceType: 'soundcloud',
        playbackInput: 'https://soundcloud.com/afusic/not-enough',
        metadata: {
          identifier: 'sc-not-enough',
          canonicalSourceType: 'soundcloud',
          sourceName: 'soundcloud'
        }
      }];
    }

    if (source === 'youtube_music') {
      return [{
        title: 'Not Enough (Official Video)',
        artist: 'Afusic',
        durationMs: 191000,
        sourceType: 'youtube_music',
        playbackInput: 'https://www.youtube.com/watch?v=yt-not-enough',
        metadata: {
          identifier: 'yt-not-enough',
          canonicalSourceType: 'youtube_music',
          sourceName: 'youtube_music'
        }
      }];
    }

    return [];
  };

  try {
    const [seed] = buildRecommendationSeeds({
      guildId: 'guild-sc',
      mode: 'artist-continuity',
      lastItem: {
        kind: 'music',
        source: 'slash',
        title: 'Pal Pal',
        artist: 'Afusic',
        durationMs: 190000,
        sourceType: 'soundcloud',
        playbackInput: 'https://soundcloud.com/afusic/pal-pal',
        metadata: {
          identifier: 'sc-pal-pal',
          canonicalSourceType: 'soundcloud',
          sourceName: 'soundcloud'
        }
      },
      anchorSeed: null,
      historyTracks: []
    });

    const recommendation = await getRecommendationForSeed({
      seed,
      recentCanonicalKeys: [],
      recentTracks: [],
      recentAutoplayArtists: [],
      memoryContext: {}
    });

    assert.equal(recommendation?.sourceType, 'soundcloud');
    assert.equal(recommendation?.metadata?.autoplayDebugTrace?.winner?.provenance?.source, 'soundcloud-search');
    assert.equal(calls[0]?.source, 'soundcloud');
  } finally {
    lavalinkResolver.searchSource = originalSearchSource;
  }
});

test('deezer seeds keep deezer candidates ahead of youtube fallbacks in the shared pipeline', async () => {
  const originalSearchSource = lavalinkResolver.searchSource;
  const calls = [];

  lavalinkResolver.searchSource = async (query, source) => {
    calls.push({ query, source });

    if (source === 'deezer') {
      return [{
        title: 'Makhna',
        artist: 'Asees Kaur',
        durationMs: 214000,
        sourceType: 'deezer',
        playbackInput: 'https://www.deezer.com/track/42424242',
        metadata: {
          identifier: '42424242',
          canonicalSourceType: 'deezer',
          sourceName: 'deezer'
        }
      }];
    }

    if (source === 'youtube_music') {
      return [{
        title: 'Makhna (Official Video)',
        artist: 'Asees Kaur',
        durationMs: 214000,
        sourceType: 'youtube_music',
        playbackInput: 'https://www.youtube.com/watch?v=yt-bairan',
        metadata: {
          identifier: 'yt-bairan',
          canonicalSourceType: 'youtube_music',
          sourceName: 'youtube_music'
        }
      }];
    }

    return [];
  };

  try {
    const [seed] = buildRecommendationSeeds({
      guildId: 'guild-dz',
      mode: 'strict-original',
      lastItem: {
        kind: 'music',
        source: 'slash',
        title: 'Bairan',
        artist: 'Asees Kaur',
        durationMs: 214000,
        sourceType: 'deezer',
        playbackInput: 'https://www.deezer.com/track/31313131',
        metadata: {
          identifier: '31313131',
          canonicalSourceType: 'deezer',
          sourceName: 'deezer'
        }
      },
      anchorSeed: null,
      historyTracks: []
    });

    const recommendation = await getRecommendationForSeed({
      seed,
      recentCanonicalKeys: [],
      recentTracks: [],
      recentAutoplayArtists: [],
      memoryContext: {}
    });

    assert.equal(recommendation?.sourceType, 'deezer');
    assert.equal(recommendation?.metadata?.autoplayDebugTrace?.winner?.provenance?.source, 'deezer-search');
    assert.equal(calls[0]?.source, 'deezer');
  } finally {
    lavalinkResolver.searchSource = originalSearchSource;
  }
});

test('recommendation pipeline cools repeated spotify native recommendation failures within the same seed session', async () => {
  const originalSearchSpotifyRecommendations = lavalinkResolver.searchSpotifyRecommendations;
  let nativeRecommendationCalls = 0;

  lavalinkResolver.searchSpotifyRecommendations = async () => {
    nativeRecommendationCalls += 1;
    return [];
  };

  try {
    const [seed] = buildRecommendationSeeds({
      guildId: 'guild-sprec-cooldown',
      mode: 'radio',
      lastItem: {
        kind: 'music',
        source: 'slash',
        title: 'Unknown Seed',
        artist: 'Unknown Artist',
        durationMs: 180000,
        sourceType: 'spotify',
        playbackInput: 'encoded-spotify-track',
        metadata: {
          sourceName: 'spotify',
          canonicalSourceType: 'spotify'
        }
      },
      anchorSeed: null,
      historyTracks: []
    });

    const memoryContext = {
      recentCanonicalKeys: [],
      skippedCanonicalKeys: [],
      failedCanonicalKeys: [],
      recentArtistKeys: [],
      recentAutoplayArtistKeys: [],
      seedSession: {
        canonicalKey: seed.canonicalKey,
        artistKey: '',
        sameArtistHits: 0,
        hasDiversifiedAwayFromSeedArtist: false,
        spotifyNativeRecommendationsFailed: false
      }
    };

    await getRecommendationForSeed({
      seed,
      recentCanonicalKeys: [],
      recentTracks: [],
      recentAutoplayArtists: [],
      memoryContext
    });

    await getRecommendationForSeed({
      seed,
      recentCanonicalKeys: [],
      recentTracks: [],
      recentAutoplayArtists: [],
      memoryContext
    });

    assert.equal(nativeRecommendationCalls, 1);
    assert.equal(memoryContext.seedSession.spotifyNativeRecommendationsFailed, true);
  } finally {
    lavalinkResolver.searchSpotifyRecommendations = originalSearchSpotifyRecommendations;
  }
});

test('strict-original spotify seeds prefer mirror-related context before broad same-artist spotify catalog fallback', async () => {
  const originalClientId = process.env.SPOTIFY_CLIENT_ID;
  const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const originalFetch = global.fetch;
  const originalSearchSpotifyRecommendations = lavalinkResolver.searchSpotifyRecommendations;
  const originalSearchYouTubeRelated = lavalinkResolver.searchYouTubeRelated;

  process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';

  const spotifySearchCalls = [];
  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('accounts.spotify.com/api/token')) {
      return {
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          expires_in: 3600
        })
      };
    }

    if (requestUrl.includes('/v1/recommendations?')) {
      return {
        ok: true,
        json: async () => ({
          tracks: []
        })
      };
    }

    if (requestUrl.includes('/v1/search?')) {
      spotifySearchCalls.push(requestUrl);
      return {
        ok: true,
        json: async () => ({
          tracks: {
            items: [{
              name: 'Ee Manase Se Se',
              artists: [{ name: 'S.P. Balasubrahmanyam' }],
              uri: 'spotify:track:68cR7xQ7LKVms9EGKjDVTP',
              popularity: 72
            }]
          }
        })
      };
    }

    throw new Error(`Unexpected fetch call: ${requestUrl}`);
  };

  lavalinkResolver.searchSpotifyRecommendations = async () => [];
  lavalinkResolver.searchYouTubeRelated = async () => [{
    title: 'Saathiya Tune Kya Kiya (Official Audio)',
    artist: 'S. P. Balasubrahmanyam',
    durationMs: 234000,
    sourceType: 'youtube_music',
    playbackInput: 'https://www.youtube.com/watch?v=close-classic-123',
    metadata: {
      identifier: 'close-classic-123',
      sourceName: 'youtube_music',
      canonicalSourceType: 'youtube_music'
    }
  }];

  try {
    const [seed] = buildRecommendationSeeds({
      guildId: 'guild-classic-spotify',
      mode: 'strict-original',
      lastItem: {
        kind: 'music',
        source: 'slash',
        title: 'Bahut Pyar Karte Hai - Male Version',
        artist: 'S. P. Balasubrahmanyam',
        durationMs: 235000,
        sourceType: 'spotify',
        playbackInput: 'https://open.spotify.com/track/6yTtUUlsBXN9h9ZxTxGWMS',
        metadata: {
          spotifyTrackId: '6yTtUUlsBXN9h9ZxTxGWMS',
          spotifyUri: 'https://open.spotify.com/track/6yTtUUlsBXN9h9ZxTxGWMS',
          sourceName: 'spotify',
          canonicalSourceType: 'spotify',
          identifier: 'classic-seed-mirror'
        }
      },
      anchorSeed: null,
      historyTracks: []
    });

    const recommendation = await getRecommendationForSeed({
      seed,
      recentCanonicalKeys: [],
      recentTracks: [],
      recentAutoplayArtists: [],
      memoryContext: {
        recentCanonicalKeys: [],
        skippedCanonicalKeys: [],
        failedCanonicalKeys: [],
        recentArtistKeys: [],
        recentAutoplayArtistKeys: [],
        seedSession: {
          canonicalKey: seed.canonicalKey,
          artistKey: 's p balasubrahmanyam',
          sameArtistHits: 0,
          hasDiversifiedAwayFromSeedArtist: false,
          spotifyNativeRecommendationsFailed: false
        }
      }
    });

    assert.equal(recommendation?.title, 'Saathiya Tune Kya Kiya (Official Audio)');
    assert.equal(recommendation?.metadata?.autoplayDebugTrace?.winner?.provenance?.source, 'yt-related');
    assert.equal(spotifySearchCalls.length, 0);
  } finally {
    if (originalClientId === undefined) {
      delete process.env.SPOTIFY_CLIENT_ID;
    } else {
      process.env.SPOTIFY_CLIENT_ID = originalClientId;
    }

    if (originalClientSecret === undefined) {
      delete process.env.SPOTIFY_CLIENT_SECRET;
    } else {
      process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;
    }

    global.fetch = originalFetch;
    lavalinkResolver.searchSpotifyRecommendations = originalSearchSpotifyRecommendations;
    lavalinkResolver.searchYouTubeRelated = originalSearchYouTubeRelated;
  }
});

test('radio spotify seeds prefer broader related context before same-artist spotify catalog fallback', async () => {
  const originalClientId = process.env.SPOTIFY_CLIENT_ID;
  const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const originalFetch = global.fetch;
  const originalSearchSpotifyRecommendations = lavalinkResolver.searchSpotifyRecommendations;
  const originalSearchYouTubeRelated = lavalinkResolver.searchYouTubeRelated;

  process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';

  const spotifySearchCalls = [];
  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('accounts.spotify.com/api/token')) {
      return {
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          expires_in: 3600
        })
      };
    }

    if (requestUrl.includes('/v1/recommendations?')) {
      return {
        ok: true,
        json: async () => ({
          tracks: []
        })
      };
    }

    if (requestUrl.includes('/v1/search?')) {
      spotifySearchCalls.push(requestUrl);
      return {
        ok: true,
        json: async () => ({
          tracks: {
            items: [{
              name: 'Perfect',
              artists: [{ name: 'Ed Sheeran' }],
              uri: 'spotify:track:perfect1234567890123456',
              popularity: 88
            }]
          }
        })
      };
    }

    throw new Error(`Unexpected fetch call: ${requestUrl}`);
  };

  lavalinkResolver.searchSpotifyRecommendations = async () => [];
  lavalinkResolver.searchYouTubeRelated = async () => [{
    title: 'Closer',
    artist: 'The Chainsmokers',
    durationMs: 244000,
    sourceType: 'youtube',
    playbackInput: 'https://www.youtube.com/watch?v=closer12345',
    metadata: {
      identifier: 'closer12345',
      sourceName: 'youtube',
      canonicalSourceType: 'youtube'
    }
  }];

  try {
    const [seed] = buildRecommendationSeeds({
      guildId: 'guild-radio-spotify',
      mode: 'radio',
      lastItem: {
        kind: 'music',
        source: 'slash',
        title: 'Shape of You',
        artist: 'Ed Sheeran',
        durationMs: 233000,
        sourceType: 'spotify',
        playbackInput: 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3',
        metadata: {
          spotifyTrackId: '7qiZfU4dY1lWllzX7mPBI3',
          spotifyUri: 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3',
          sourceName: 'spotify',
          canonicalSourceType: 'spotify',
          identifier: 'shape-seed-mirror'
        }
      },
      anchorSeed: null,
      historyTracks: []
    });

    const recommendation = await getRecommendationForSeed({
      seed,
      recentCanonicalKeys: [],
      recentTracks: [],
      recentAutoplayArtists: [],
      memoryContext: {
        recentCanonicalKeys: [],
        skippedCanonicalKeys: [],
        failedCanonicalKeys: [],
        recentArtistKeys: [],
        recentAutoplayArtistKeys: [],
        seedSession: {
          canonicalKey: seed.canonicalKey,
          artistKey: 'ed sheeran',
          sameArtistHits: 0,
          hasDiversifiedAwayFromSeedArtist: false,
          spotifyNativeRecommendationsFailed: false,
          recentTitleFamilies: []
        }
      }
    });

    assert.equal(recommendation?.title, 'Closer');
    assert.equal(recommendation?.metadata?.autoplayDebugTrace?.winner?.provenance?.source, 'yt-related');
    assert.equal(spotifySearchCalls.length, 0);
  } finally {
    if (originalClientId === undefined) {
      delete process.env.SPOTIFY_CLIENT_ID;
    } else {
      process.env.SPOTIFY_CLIENT_ID = originalClientId;
    }

    if (originalClientSecret === undefined) {
      delete process.env.SPOTIFY_CLIENT_SECRET;
    } else {
      process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;
    }

    global.fetch = originalFetch;
    lavalinkResolver.searchSpotifyRecommendations = originalSearchSpotifyRecommendations;
    lavalinkResolver.searchYouTubeRelated = originalSearchYouTubeRelated;
  }
});

test('strict-original text-query seeds search canonically before spotify-native fallback paths', async () => {
  const originalClientId = process.env.SPOTIFY_CLIENT_ID;
  const originalClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const originalFetch = global.fetch;
  const originalSearchSource = lavalinkResolver.searchSource;

  process.env.SPOTIFY_CLIENT_ID = 'test-client-id';
  process.env.SPOTIFY_CLIENT_SECRET = 'test-client-secret';

  const searchSourceCalls = [];
  global.fetch = async () => {
    throw new Error('Spotify API should not be called for a text-seed canonical search winner.');
  };

  lavalinkResolver.searchSource = async (query, source) => {
    searchSourceCalls.push({ query, source });

    if (source === 'youtube_music') {
      return [{
        title: 'Saathiya Tune Kya Kiya (Official Audio)',
        artist: 'S. P. Balasubrahmanyam',
        durationMs: 234000,
        sourceType: 'youtube_music',
        playbackInput: 'https://www.youtube.com/watch?v=close-classic-123',
        metadata: {
          identifier: 'close-classic-123',
          sourceName: 'youtube_music',
          canonicalSourceType: 'youtube_music'
        }
      }];
    }

    return [];
  };

  try {
    const [seed] = buildRecommendationSeeds({
      guildId: 'guild-text-search-priority',
      mode: 'strict-original',
      lastItem: {
        kind: 'music',
        source: 'slash',
        title: 'Bahut Pyar Karte Hai - Male Version',
        artist: 'S. P. Balasubrahmanyam',
        durationMs: 235000,
        sourceType: 'spotify',
        playbackInput: 'https://open.spotify.com/track/6yTtUUlsBXN9h9ZxTxGWMS',
        metadata: {
          spotifyTrackId: '6yTtUUlsBXN9h9ZxTxGWMS',
          spotifyUri: 'https://open.spotify.com/track/6yTtUUlsBXN9h9ZxTxGWMS',
          sourceName: 'spotify',
          canonicalSourceType: 'spotify',
          resolvedBy: 'search:spotify',
          autoplaySeedType: 'text'
        }
      },
      anchorSeed: null,
      historyTracks: []
    });

    const recommendation = await getRecommendationForSeed({
      seed,
      recentCanonicalKeys: [],
      recentTracks: [],
      recentAutoplayArtists: [],
      memoryContext: {}
    });

    assert.equal(seed.sourceType, 'text');
    assert.equal(seed.providerSourceType, 'spotify');
    assert.equal(recommendation?.title, 'Saathiya Tune Kya Kiya (Official Audio)');
    assert.equal(recommendation?.metadata?.autoplayDebugTrace?.winner?.provenance?.source, 'ytm-search');
    assert.deepEqual(searchSourceCalls.slice(0, 3).map((call) => call.source), ['youtube_music', 'youtube', 'spotify']);
  } finally {
    if (originalClientId === undefined) {
      delete process.env.SPOTIFY_CLIENT_ID;
    } else {
      process.env.SPOTIFY_CLIENT_ID = originalClientId;
    }

    if (originalClientSecret === undefined) {
      delete process.env.SPOTIFY_CLIENT_SECRET;
    } else {
      process.env.SPOTIFY_CLIENT_SECRET = originalClientSecret;
    }

    global.fetch = originalFetch;
    lavalinkResolver.searchSource = originalSearchSource;
  }
});
