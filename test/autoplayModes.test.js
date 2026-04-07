import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecommendationSeeds, evaluateRecommendationPool } from '../src/services/recommendationPipeline.js';

function buildSeed(mode, overrides = {}) {
  const [seed] = buildRecommendationSeeds({
    guildId: `guild-${mode}`,
    mode,
    lastItem: {
      kind: 'music',
      source: 'slash',
      title: 'Shape of You',
      artist: 'Ed Sheeran',
      durationMs: 233000,
      sourceType: 'spotify',
      playbackInput: 'https://open.spotify.com/track/1234567890123456789012',
      metadata: {
        spotifyTrackId: '1234567890123456789012',
        spotifyUri: 'https://open.spotify.com/track/1234567890123456789012',
        spotifyAlbum: 'Divide',
        sourceName: 'spotify',
        canonicalSourceType: 'spotify'
      },
      ...overrides
    },
    anchorSeed: null,
    historyTracks: []
  });

  return seed;
}

function makeCandidate({
  title,
  artist,
  durationMs,
  sourceType = 'youtube_music',
  identifier,
  spotifyTrackId,
  album,
  provenanceSource
}) {
  const metadata = {
    spotifyAlbum: album ?? null,
    sourceName: sourceType,
    canonicalSourceType: sourceType
  };

  if (identifier) {
    metadata.identifier = identifier;
  }

  if (spotifyTrackId) {
    metadata.spotifyTrackId = spotifyTrackId;
    metadata.spotifyUri = `https://open.spotify.com/track/${spotifyTrackId}`;
  }

  return {
    title,
    artist,
    durationMs,
    sourceType,
    playbackInput: spotifyTrackId
      ? `https://open.spotify.com/track/${spotifyTrackId}`
      : `https://www.youtube.com/watch?v=${identifier}`,
    metadata,
    provenance: {
      source: provenanceSource,
      query: `${artist} ${title}`
    }
  };
}

const FIXTURE_CANDIDATES = [
  makeCandidate({
    title: 'Perfect (Official Music Video)',
    artist: 'Ed Sheeran',
    durationMs: 235000,
    sourceType: 'youtube_music',
    identifier: 'perfect12345',
    album: 'Divide',
    provenanceSource: 'ytm-search'
  }),
  makeCandidate({
    title: 'Castle on the Hill',
    artist: 'Ed Sheeran',
    durationMs: 246000,
    sourceType: 'spotify',
    spotifyTrackId: 'ABCDEFGHIJKLmnopqrstuv',
    album: 'Divide',
    provenanceSource: 'spotify-search'
  }),
  makeCandidate({
    title: 'Blinding Lights (Official Video)',
    artist: 'The Weeknd',
    durationMs: 200000,
    sourceType: 'youtube_music',
    identifier: 'blinding123',
    album: 'After Hours',
    provenanceSource: 'ytm-search'
  }),
  makeCandidate({
    title: 'Closer',
    artist: 'The Chainsmokers',
    durationMs: 244000,
    sourceType: 'youtube',
    identifier: 'closer12345',
    album: 'Collage',
    provenanceSource: 'yt-related'
  })
];

test('autoplay modes choose different winners from the same candidate pool', () => {
  const strictResult = evaluateRecommendationPool({
    seed: buildSeed('strict-original'),
    candidates: FIXTURE_CANDIDATES
  });
  const continuityResult = evaluateRecommendationPool({
    seed: buildSeed('artist-continuity'),
    candidates: FIXTURE_CANDIDATES
  });
  const discoveryResult = evaluateRecommendationPool({
    seed: buildSeed('discovery'),
    candidates: FIXTURE_CANDIDATES
  });
  const radioResult = evaluateRecommendationPool({
    seed: buildSeed('radio'),
    candidates: FIXTURE_CANDIDATES
  });

  assert.equal(strictResult.winner.track.title, 'Perfect (Official Music Video)');
  assert.equal(continuityResult.winner.track.title, 'Castle on the Hill');
  assert.equal(discoveryResult.winner.track.title, 'Blinding Lights (Official Video)');
  assert.equal(radioResult.winner.track.title, 'Closer');
});

test('strict-original rejects edited variants and surfaces the rejection in the debug trace', () => {
  const result = evaluateRecommendationPool({
    seed: buildSeed('strict-original', {
      title: 'Hothon Se Chhu Lo Tum',
      artist: 'Jagjit Singh',
      durationMs: 295000,
      metadata: {
        identifier: 'seed-jagjit',
        sourceName: 'youtube_music',
        canonicalSourceType: 'youtube_music'
      }
    }),
    candidates: [
      makeCandidate({
        title: 'Tumko Dekha (Edited)',
        artist: 'Jagjit Singh',
        durationMs: 290000,
        sourceType: 'youtube_music',
        identifier: 'edited-variant',
        provenanceSource: 'ytm-search'
      }),
      makeCandidate({
        title: 'Hoshwalon Ko Khabar Kya',
        artist: 'Jagjit Singh - Topic',
        durationMs: 303000,
        sourceType: 'youtube_music',
        identifier: 'hoshwalon123',
        provenanceSource: 'ytm-search'
      })
    ]
  });

  assert.equal(result.winner.track.title, 'Hoshwalon Ko Khabar Kya');
  assert.ok(
    result.debugTrace.rejectedTopCandidates.some(
      (candidate) => candidate.title === 'Tumko Dekha (Edited)' && candidate.rejectionReasons.includes('unwanted_variant')
    )
  );
});

test('failed canonical keys are rejected so the next nearby candidate wins', () => {
  const result = evaluateRecommendationPool({
    seed: buildSeed('radio', {
      title: 'Pal Pal',
      artist: 'Talwiinder',
      durationMs: 240000,
      metadata: {
        identifier: 'seed-pal-pal',
        sourceName: 'youtube_music',
        canonicalSourceType: 'youtube_music'
      }
    }),
    candidates: [
      makeCandidate({
        title: 'Login Blocked Candidate',
        artist: 'Talwiinder',
        durationMs: 238000,
        sourceType: 'youtube',
        identifier: 'blocked123',
        provenanceSource: 'yt-related'
      }),
      makeCandidate({
        title: 'Not Enough',
        artist: 'Afusic',
        durationMs: 226000,
        sourceType: 'youtube_music',
        identifier: 'notenough123',
        provenanceSource: 'ytm-search'
      })
    ],
    memoryContext: {
      recentCanonicalKeys: [],
      skippedCanonicalKeys: [],
      failedCanonicalKeys: ['youtube:blocked123'],
      recentArtistKeys: [],
      recentAutoplayArtistKeys: []
    }
  });

  assert.equal(result.winner.track.title, 'Not Enough');
  assert.ok(
    result.debugTrace.rejectedTopCandidates.some(
      (candidate) => candidate.title === 'Login Blocked Candidate' && candidate.rejectionReasons.includes('failed_recently')
    )
  );
});

test('strict-original prefers a stronger related canonical pick over a loose youtube same-artist catalog jump', () => {
  const result = evaluateRecommendationPool({
    seed: buildSeed('strict-original', {
      title: 'Google Pay',
      artist: 'Karma',
      durationMs: 231000,
      sourceType: 'youtube_music',
      metadata: {
        identifier: 'seed-google-pay',
        sourceName: 'youtube_music',
        canonicalSourceType: 'youtube_music',
        lavalinkTrack: {
          pluginInfo: {
            albumName: 'Fake YouTube Album'
          }
        }
      }
    }),
    candidates: [
      makeCandidate({
        title: 'SPRINTER',
        artist: 'KARMA',
        durationMs: 188000,
        sourceType: 'youtube_music',
        identifier: 'sprinter123',
        provenanceSource: 'ytm-search'
      }),
      makeCandidate({
        title: 'KR$NA - NO CAP (OFFICIAL VIDEO) | KALAMKAAR',
        artist: 'Kalamkaar',
        durationMs: 218000,
        sourceType: 'youtube',
        identifier: 'nocap123',
        provenanceSource: 'yt-related'
      })
    ]
  });

  assert.equal(result.winner.track.title, 'KR$NA - NO CAP (OFFICIAL VIDEO) | KALAMKAAR');
  assert.ok(!result.debugTrace.winner.reasonSummary.includes('+same_album'));
});

test('strict-original does not return to the seed artist after the session has already diversified away', () => {
  const result = evaluateRecommendationPool({
    seed: buildSeed('strict-original', {
      title: 'Google Pay',
      artist: 'Karma',
      durationMs: 231000,
      sourceType: 'youtube_music',
      metadata: {
        identifier: 'seed-google-pay',
        sourceName: 'youtube_music',
        canonicalSourceType: 'youtube_music'
      }
    }),
    candidates: [
      makeCandidate({
        title: 'Tony Montana',
        artist: 'KARMA',
        durationMs: 228000,
        sourceType: 'youtube',
        identifier: 'tony123',
        provenanceSource: 'yt-related'
      }),
      makeCandidate({
        title: 'KR$NA - NO CAP (OFFICIAL VIDEO) | KALAMKAAR',
        artist: 'Kalamkaar',
        durationMs: 218000,
        sourceType: 'youtube',
        identifier: 'nocap123',
        provenanceSource: 'yt-related'
      })
    ],
    memoryContext: {
      recentCanonicalKeys: [],
      skippedCanonicalKeys: [],
      failedCanonicalKeys: [],
      recentArtistKeys: [],
      recentAutoplayArtistKeys: [],
      seedSession: {
        canonicalKey: 'youtube:e7Oy127kmwg',
        artistKey: 'karma',
        sameArtistHits: 0,
        hasDiversifiedAwayFromSeedArtist: true
      }
    }
  });

  assert.equal(result.winner.track.title, 'KR$NA - NO CAP (OFFICIAL VIDEO) | KALAMKAAR');
  assert.ok(
    result.debugTrace.rejectedTopCandidates.some(
      (candidate) => candidate.title === 'Tony Montana' && candidate.rejectionReasons.includes('seed_artist_return')
    )
  );
});

test('session selection salt rotates among close radio candidates for the same seed', () => {
  const seed = buildSeed('radio');
  const candidates = [
    makeCandidate({
      title: 'Stereo Hearts (feat. Adam Levine)',
      artist: 'Gym Class Heroes - Topic',
      durationMs: 211000,
      sourceType: 'youtube',
      identifier: 'stereo123',
      provenanceSource: 'yt-related'
    }),
    makeCandidate({
      title: 'Rockabye (feat. Sean Paul & Anne-Marie)',
      artist: 'Clean Bandit',
      durationMs: 251000,
      sourceType: 'youtube',
      identifier: 'rockabye123',
      provenanceSource: 'yt-related'
    }),
    makeCandidate({
      title: 'Closer',
      artist: 'The Chainsmokers',
      durationMs: 244000,
      sourceType: 'youtube',
      identifier: 'closer12345',
      provenanceSource: 'yt-related'
    })
  ];

  const buildMemoryContext = (selectionSalt) => ({
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
      recentTitleFamilies: [],
      autoplayStep: 0,
      selectionSalt
    }
  });

  const sessionA = evaluateRecommendationPool({
    seed,
    candidates,
    memoryContext: buildMemoryContext('session-a')
  });
  const sessionB = evaluateRecommendationPool({
    seed,
    candidates,
    memoryContext: buildMemoryContext('session-b')
  });

  assert.notEqual(sessionA.winner.track.title, sessionB.winner.track.title);
  assert.ok(['Stereo Hearts (feat. Adam Levine)', 'Rockabye (feat. Sean Paul & Anne-Marie)', 'Closer'].includes(sessionA.winner.track.title));
  assert.ok(['Stereo Hearts (feat. Adam Levine)', 'Rockabye (feat. Sean Paul & Anne-Marie)', 'Closer'].includes(sessionB.winner.track.title));
});

test('strict-original rejects loose low-signal tail candidates instead of drifting into generic youtube results', () => {
  const result = evaluateRecommendationPool({
    seed: buildSeed('strict-original', {
      title: 'Baarishein',
      artist: 'Anuv Jain',
      durationMs: 207000,
      sourceType: 'youtube',
      metadata: {
        identifier: 'seed-baarishein',
        sourceName: 'youtube',
        canonicalSourceType: 'youtube'
      }
    }),
    candidates: [
      makeCandidate({
        title: 'Baarish',
        artist: 'Mohammed Irfan',
        durationMs: 375000,
        sourceType: 'youtube_music',
        identifier: 'baarish123',
        provenanceSource: 'ytm-search'
      }),
      makeCandidate({
        title: 'Anuv Jain Top 7 Best Songs | Best of Anuv Jain',
        artist: 'SN MUSIC',
        durationMs: 600000,
        sourceType: 'youtube',
        identifier: 'top7anuv',
        provenanceSource: 'yt-search'
      }),
      makeCandidate({
        title: 'British Guy REACTS to Anuv Jain X Lost Stories "Arz Kiya Hai" | Official Video | Coke Studio Bharat',
        artist: 'G.O.T Extra',
        durationMs: 330000,
        sourceType: 'youtube',
        identifier: 'react123',
        provenanceSource: 'yt-search'
      })
    ]
  });

  assert.equal(result.winner, null);
  assert.ok(
    result.rejected.some(
      (candidate) => candidate.track.title === 'Baarish' && candidate.rejectionReasons.includes('strict_signal_floor')
    )
  );
  assert.ok(
    result.rejected.some(
      (candidate) => candidate.track.title.includes('Top 7 Best Songs') && candidate.rejectionReasons.includes('unwanted_variant')
    )
  );
  assert.ok(
    result.rejected.some(
      (candidate) => candidate.track.title.includes('British Guy REACTS') && candidate.rejectionReasons.includes('unwanted_variant')
    )
  );
});
