import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../src/lib/sqlite.js';
import {
  addFavorite,
  getFavoriteAtPosition,
  getFavorites,
  hasFavorite,
  normalizeFavoriteTrack,
  removeFavoriteAtPosition
} from '../src/services/musicCatalog.js';

function useTempDataDir(t) {
  const previous = process.env.DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmonia-favorites-'));

  closeDb();
  process.env.DATA_DIR = tempDir;

  t.after(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (previous === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = previous;
    }
  });
}

test('normalizeFavoriteTrack keeps replay-friendly fields and prefers canonical request queries', () => {
  const normalized = normalizeFavoriteTrack({
    title: 'Tum Hi Ho',
    artist: 'Arijit Singh',
    durationMs: 241000,
    sourceType: 'spotify',
    playbackInput: 'https://www.youtube.com/watch?v=fsiPzT50ZiM',
    metadata: {
      canonicalUrl: 'https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di',
      spotifyUri: 'spotify:track:56zZ48jdyY2oDXHVnwg5Di',
      thumbnailUrl: 'https://img.example/cover.jpg'
    }
  });

  assert.deepEqual(normalized, {
    title: 'Tum Hi Ho',
    artist: 'Arijit Singh',
    durationMs: 241000,
    sourceType: 'spotify',
    requestQuery: 'https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di',
    playbackUrl: 'https://www.youtube.com/watch?v=fsiPzT50ZiM',
    canonicalUrl: 'https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di',
    spotifyUri: 'spotify:track:56zZ48jdyY2oDXHVnwg5Di',
    thumbnailUrl: 'https://img.example/cover.jpg'
  });
});

test('favorites storage deduplicates repeated saves of the same normalized track', { concurrency: false }, (t) => {
  useTempDataDir(t);

  const track = {
    title: 'Tum Hi Ho',
    artist: 'Arijit Singh',
    durationMs: 241000,
    sourceType: 'spotify',
    playbackInput: 'https://www.youtube.com/watch?v=fsiPzT50ZiM',
    metadata: {
      canonicalUrl: 'https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di',
      spotifyUri: 'spotify:track:56zZ48jdyY2oDXHVnwg5Di'
    }
  };

  assert.equal(addFavorite('guild-1', 'user-1', track), true);
  assert.equal(addFavorite('guild-1', 'user-1', track), true);
  assert.equal(hasFavorite('guild-1', 'user-1', track), true);

  const favorites = getFavorites('guild-1', 'user-1');
  assert.equal(favorites.length, 1);
  assert.equal(favorites[0].title, 'Tum Hi Ho');
  assert.equal(favorites[0].requestQuery, 'https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di');
});

test('favorites can be selected and removed by visible position', { concurrency: false }, (t) => {
  useTempDataDir(t);

  addFavorite('guild-2', 'user-2', {
    title: 'Tum Hi Ho',
    artist: 'Arijit Singh',
    sourceUrl: 'https://www.youtube.com/watch?v=fsiPzT50ZiM'
  });
  addFavorite('guild-2', 'user-2', {
    title: 'Phir Kabhi',
    artist: 'Arijit Singh',
    sourceUrl: 'https://www.youtube.com/watch?v=uA-9JmTcav8'
  });

  const topFavorite = getFavoriteAtPosition('guild-2', 'user-2', 1);
  assert.equal(topFavorite.title, 'Phir Kabhi');

  const removed = removeFavoriteAtPosition('guild-2', 'user-2', 1);
  assert.equal(removed.title, 'Phir Kabhi');

  const remaining = getFavorites('guild-2', 'user-2');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].title, 'Tum Hi Ho');
});
