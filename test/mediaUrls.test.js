import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMediaSource,
  isPlaylistMediaUrl,
  normalizeMediaInput
} from '../src/utils/mediaUrls.js';

test('normalizeMediaInput converts spotify track uris into canonical web urls', async () => {
  const normalized = await normalizeMediaInput('spotify:track:7qiZfU4dY1lWllzX7mPBI3');

  assert.equal(normalized, 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3');
});

test('detectMediaSource recognizes provider short-link hosts', () => {
  assert.equal(detectMediaSource('https://spotify.link/abc123'), 'spotify');
  assert.equal(detectMediaSource('https://on.soundcloud.com/xyz987'), 'soundcloud');
  assert.equal(detectMediaSource('https://deezer.page.link/qwe456'), 'deezer');
});

test('normalizeMediaInput expands provider short links before routing', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    url: 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3?si=share'
  });

  const normalized = await normalizeMediaInput('https://spotify.link/shape-share');

  global.fetch = originalFetch;

  assert.equal(normalized, 'https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3?si=share');
});

test('isPlaylistMediaUrl uses normalized short links for playlist detection', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    url: 'https://soundcloud.com/artist-name/sets/monsoon-tapes'
  });

  const isPlaylist = await isPlaylistMediaUrl('https://on.soundcloud.com/monsoonset');

  global.fetch = originalFetch;

  assert.equal(isPlaylist, true);
});

test('isPlaylistMediaUrl detects deezer playlist short links after expansion', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    url: 'https://www.deezer.com/playlist/908172635'
  });

  const isPlaylist = await isPlaylistMediaUrl('https://deezer.page.link/playlistshare');

  global.fetch = originalFetch;

  assert.equal(isPlaylist, true);
});
