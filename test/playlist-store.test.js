import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../src/lib/sqlite.js';
import {
  appendTracksToPlaylist,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  removePlaylistTrackAtPosition,
  renamePlaylist,
  savePlaylist
} from '../src/services/playlistStore.js';

function useTempDataDir(t) {
  const previous = process.env.DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmonia-playlists-'));

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

test('playlist store saves, retrieves, and deletes named playlists', { concurrency: false }, (t) => {
  useTempDataDir(t);

  const saved = savePlaylist('guild-1', 'user-1', 'Late Night', [
    {
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      sourceUrl: 'https://www.youtube.com/watch?v=fsiPzT50ZiM'
    },
    {
      title: 'Phir Kabhi',
      artist: 'Arijit Singh',
      sourceUrl: 'https://www.youtube.com/watch?v=uA-9JmTcav8'
    }
  ]);

  assert.equal(saved.name, 'Late Night');
  assert.equal(saved.trackCount, 2);

  const fetched = getPlaylist('guild-1', 'user-1', 'late night');
  assert.equal(fetched.name, 'Late Night');
  assert.equal(fetched.tracks.length, 2);
  assert.equal(getPlaylists('guild-1', 'user-1').length, 1);

  assert.equal(deletePlaylist('guild-1', 'user-1', 'Late Night'), true);
  assert.equal(getPlaylist('guild-1', 'user-1', 'Late Night'), null);
});

test('playlist store can append tracks, rename playlists, and remove saved positions', { concurrency: false }, (t) => {
  useTempDataDir(t);

  savePlaylist('guild-2', 'user-1', 'Road Trip', [
    {
      title: 'Track One',
      artist: 'Artist A',
      sourceUrl: 'https://example.com/track-one.mp3'
    }
  ]);

  const appended = appendTracksToPlaylist('guild-2', 'user-1', 'Road Trip', [
    {
      title: 'Track Two',
      artist: 'Artist B',
      sourceUrl: 'https://example.com/track-two.mp3'
    }
  ]);
  assert.equal(appended.updated, true);
  assert.equal(appended.trackCount, 2);

  const renamed = renamePlaylist('guild-2', 'user-1', 'Road Trip', 'Night Drive');
  assert.equal(renamed.renamed, true);
  assert.equal(getPlaylist('guild-2', 'user-1', 'Road Trip'), null);
  assert.equal(getPlaylist('guild-2', 'user-1', 'Night Drive').trackCount, 2);

  const removed = removePlaylistTrackAtPosition('guild-2', 'user-1', 'Night Drive', 2);
  assert.equal(removed.removed, true);
  assert.equal(removed.track.title, 'Track Two');
  assert.equal(getPlaylist('guild-2', 'user-1', 'Night Drive').trackCount, 1);
});
