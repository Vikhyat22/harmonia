import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecommendationSeeds, evaluateRecommendationPool } from '../src/services/recommendationPipeline.js';

function buildSeed(mode, {
  guildId = `guild-${mode}`,
  title,
  artist,
  durationMs,
  sourceType,
  playbackInput,
  metadata = {}
}) {
  const [seed] = buildRecommendationSeeds({
    guildId,
    mode,
    lastItem: {
      kind: 'music',
      source: 'slash',
      title,
      artist,
      durationMs,
      sourceType,
      playbackInput,
      metadata
    },
    anchorSeed: null,
    historyTracks: []
  });

  return seed;
}

function buildTrack({
  title,
  artist,
  durationMs,
  sourceType,
  playbackInput,
  identifier,
  provenanceSource,
  album = null
}) {
  return {
    title,
    artist,
    durationMs,
    sourceType,
    playbackInput,
    metadata: {
      identifier: identifier ?? null,
      sourceName: sourceType,
      canonicalSourceType: sourceType,
      spotifyAlbum: album
    },
    provenance: {
      source: provenanceSource,
      query: `${artist} ${title}`,
      rank: 0
    }
  };
}

test('youtube seeds prefer canonical search in strict-original but related freshness in radio', () => {
  const candidates = [
    buildTrack({
      title: 'Photograph (Official Music Video)',
      artist: 'Ed Sheeran',
      durationMs: 258000,
      sourceType: 'youtube_music',
      playbackInput: 'https://www.youtube.com/watch?v=photo123',
      identifier: 'photo123',
      provenanceSource: 'ytm-search'
    }),
    buildTrack({
      title: 'Starboy',
      artist: 'The Weeknd',
      durationMs: 247000,
      sourceType: 'youtube',
      playbackInput: 'https://www.youtube.com/watch?v=starboy123',
      identifier: 'starboy123',
      provenanceSource: 'yt-related'
    })
  ];

  const strict = evaluateRecommendationPool({
    seed: buildSeed('strict-original', {
      title: 'Shape of You',
      artist: 'Ed Sheeran',
      durationMs: 233000,
      sourceType: 'youtube_music',
      playbackInput: 'https://www.youtube.com/watch?v=shape123',
      metadata: {
        identifier: 'shape123',
        sourceName: 'youtube_music',
        canonicalSourceType: 'youtube_music'
      }
    }),
    candidates
  });

  const radio = evaluateRecommendationPool({
    seed: buildSeed('radio', {
      title: 'Shape of You',
      artist: 'Ed Sheeran',
      durationMs: 233000,
      sourceType: 'youtube_music',
      playbackInput: 'https://www.youtube.com/watch?v=shape123',
      metadata: {
        identifier: 'shape123',
        sourceName: 'youtube_music',
        canonicalSourceType: 'youtube_music'
      }
    }),
    candidates
  });

  assert.equal(strict.winner.track.title, 'Photograph (Official Music Video)');
  assert.equal(radio.winner.track.title, 'Starboy');
});

test('soundcloud seeds favor same-artist continuity but diversify sooner in discovery', () => {
  const candidates = [
    buildTrack({
      title: 'Not Enough',
      artist: 'Afusic',
      durationMs: 191000,
      sourceType: 'soundcloud',
      playbackInput: 'https://soundcloud.com/afusic/not-enough',
      identifier: 'sc-not-enough',
      provenanceSource: 'soundcloud-search'
    }),
    buildTrack({
      title: 'Jhol | Coke Studio Pakistan',
      artist: 'Coke Studio Pakistan',
      durationMs: 283000,
      sourceType: 'youtube_music',
      playbackInput: 'https://www.youtube.com/watch?v=jhol123',
      identifier: 'jhol123',
      provenanceSource: 'ytm-search'
    })
  ];

  const continuity = evaluateRecommendationPool({
    seed: buildSeed('artist-continuity', {
      title: 'Pal Pal',
      artist: 'Afusic',
      durationMs: 190000,
      sourceType: 'soundcloud',
      playbackInput: 'https://soundcloud.com/afusic/pal-pal',
      metadata: {
        identifier: 'sc-pal-pal',
        sourceName: 'soundcloud',
        canonicalSourceType: 'soundcloud'
      }
    }),
    candidates
  });

  const discovery = evaluateRecommendationPool({
    seed: buildSeed('discovery', {
      title: 'Pal Pal',
      artist: 'Afusic',
      durationMs: 190000,
      sourceType: 'soundcloud',
      playbackInput: 'https://soundcloud.com/afusic/pal-pal',
      metadata: {
        identifier: 'sc-pal-pal',
        sourceName: 'soundcloud',
        canonicalSourceType: 'soundcloud'
      }
    }),
    candidates
  });

  assert.equal(continuity.winner.track.title, 'Not Enough');
  assert.equal(discovery.winner.track.title, 'Jhol | Coke Studio Pakistan');
});

test('deezer seeds prefer catalog originals in strict-original but loosen into radio candidates in radio mode', () => {
  const candidates = [
    buildTrack({
      title: 'Makhna (Official Audio)',
      artist: 'Asees Kaur',
      durationMs: 214000,
      sourceType: 'deezer',
      playbackInput: 'https://www.deezer.com/track/42424242',
      identifier: '42424242',
      provenanceSource: 'deezer-search'
    }),
    buildTrack({
      title: 'Heeriye',
      artist: 'Arijit Singh',
      durationMs: 224000,
      sourceType: 'youtube',
      playbackInput: 'https://www.youtube.com/watch?v=heeriye123',
      identifier: 'heeriye123',
      provenanceSource: 'yt-related'
    })
  ];

  const strict = evaluateRecommendationPool({
    seed: buildSeed('strict-original', {
      title: 'Bairan',
      artist: 'Asees Kaur',
      durationMs: 214000,
      sourceType: 'deezer',
      playbackInput: 'https://www.deezer.com/track/31313131',
      metadata: {
        identifier: '31313131',
        sourceName: 'deezer',
        canonicalSourceType: 'deezer'
      }
    }),
    candidates
  });

  const radio = evaluateRecommendationPool({
    seed: buildSeed('radio', {
      title: 'Bairan',
      artist: 'Asees Kaur',
      durationMs: 214000,
      sourceType: 'deezer',
      playbackInput: 'https://www.deezer.com/track/31313131',
      metadata: {
        identifier: '31313131',
        sourceName: 'deezer',
        canonicalSourceType: 'deezer'
      }
    }),
    candidates
  });

  assert.equal(strict.winner.track.title, 'Makhna (Official Audio)');
  assert.equal(radio.winner.track.title, 'Heeriye');
});

test('text-query seeds keep continuity close, discovery branching, and radio loose', () => {
  const candidates = [
    buildTrack({
      title: 'Tu Hai Kahan by AUR | تو ہے کہاں (Official Music Video)',
      artist: 'AUR',
      durationMs: 264000,
      sourceType: 'youtube_music',
      playbackInput: 'https://www.youtube.com/watch?v=aur123',
      identifier: 'aur123',
      provenanceSource: 'ytm-search'
    }),
    buildTrack({
      title: 'Anuv Jain - JO TUM MERE HO (Official Video)',
      artist: 'Anuv Jain',
      durationMs: 239000,
      sourceType: 'youtube_music',
      playbackInput: 'https://www.youtube.com/watch?v=anuv123',
      identifier: 'anuv123',
      provenanceSource: 'ytm-search'
    }),
    buildTrack({
      title: 'Jhol | Coke Studio Pakistan',
      artist: 'Coke Studio Pakistan',
      durationMs: 283000,
      sourceType: 'youtube',
      playbackInput: 'https://www.youtube.com/watch?v=jhol123',
      identifier: 'jhol123',
      provenanceSource: 'yt-related'
    })
  ];

  const strict = evaluateRecommendationPool({
    seed: buildSeed('strict-original', {
      title: 'Shikayat',
      artist: 'AUR',
      durationMs: 250000,
      sourceType: 'spotify',
      playbackInput: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
      metadata: {
        spotifyTrackId: '7e2dvR0ySx1bBJRDxVJiG1',
        spotifyUri: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
        sourceName: 'spotify',
        canonicalSourceType: 'spotify',
        resolvedBy: 'search:spotify',
        autoplaySeedType: 'text'
      }
    }),
    candidates
  });

  const continuity = evaluateRecommendationPool({
    seed: buildSeed('artist-continuity', {
      title: 'Shikayat',
      artist: 'AUR',
      durationMs: 250000,
      sourceType: 'spotify',
      playbackInput: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
      metadata: {
        spotifyTrackId: '7e2dvR0ySx1bBJRDxVJiG1',
        spotifyUri: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
        sourceName: 'spotify',
        canonicalSourceType: 'spotify',
        resolvedBy: 'search:spotify',
        autoplaySeedType: 'text'
      }
    }),
    candidates
  });

  const discovery = evaluateRecommendationPool({
    seed: buildSeed('discovery', {
      title: 'Shikayat',
      artist: 'AUR',
      durationMs: 250000,
      sourceType: 'spotify',
      playbackInput: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
      metadata: {
        spotifyTrackId: '7e2dvR0ySx1bBJRDxVJiG1',
        spotifyUri: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
        sourceName: 'spotify',
        canonicalSourceType: 'spotify',
        resolvedBy: 'search:spotify',
        autoplaySeedType: 'text'
      }
    }),
    candidates
  });

  const radio = evaluateRecommendationPool({
    seed: buildSeed('radio', {
      title: 'Shikayat',
      artist: 'AUR',
      durationMs: 250000,
      sourceType: 'spotify',
      playbackInput: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
      metadata: {
        spotifyTrackId: '7e2dvR0ySx1bBJRDxVJiG1',
        spotifyUri: 'https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1',
        sourceName: 'spotify',
        canonicalSourceType: 'spotify',
        resolvedBy: 'search:spotify',
        autoplaySeedType: 'text'
      }
    }),
    candidates
  });

  assert.equal(strict.winner.track.title, 'Tu Hai Kahan by AUR | تو ہے کہاں (Official Music Video)');
  assert.equal(continuity.winner.track.title, 'Tu Hai Kahan by AUR | تو ہے کہاں (Official Music Video)');
  assert.equal(discovery.winner.track.title, 'Anuv Jain - JO TUM MERE HO (Official Video)');
  assert.equal(radio.winner.track.title, 'Jhol | Coke Studio Pakistan');
});
