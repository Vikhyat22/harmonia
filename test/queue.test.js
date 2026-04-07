import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearQueuedItems,
  enqueueMusicRequest,
  enqueueMusicRequests,
  enqueueSpeechRequest,
  getQueueSnapshot,
  moveQueuedItem,
  removeQueuedItemAtPosition,
  removeQueuedItemsForUser,
  replayPreviousTrack,
  shuffleQueuedMusic,
  unshuffleQueuedMusic,
  skipToQueuedPosition
} from '../src/services/queue.js';

function createGuild(id) {
  return {
    id,
    channels: {
      cache: new Map(),
      fetch: async () => new Promise(() => {})
    }
  };
}

async function waitForCurrentTrack(guildId, attempts = 10) {
  for (let index = 0; index < attempts; index += 1) {
    const snapshot = getQueueSnapshot(guildId);
    if (snapshot.current) {
      return snapshot;
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  return getQueueSnapshot(guildId);
}

test('removeQueuedItemsForUser removes only matching queued requests', async () => {
  const guild = createGuild('guild-remove');

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'user-b',
    languageCode: 'en-US',
    voiceName: 'English (United States)',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'user-a',
    languageCode: 'en-US',
    voiceName: 'English (United States)',
    chunks: ['hi'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const removed = await removeQueuedItemsForUser('guild-remove', 'user-a', 1);
  const snapshot = getQueueSnapshot('guild-remove');

  assert.equal(removed, 1);
  assert.equal(snapshot.current?.requesterId, 'user-b');
  assert.equal(snapshot.queued.some((item) => item.requesterId === 'user-a'), false);
  assert.equal(snapshot.queued.some((item) => item.requesterId === 'user-b'), false);
});

test('clearQueuedItems removes upcoming items but leaves the current item untouched', async () => {
  const guild = createGuild('guild-clear-queue');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-clear-service.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'Speech Slot',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track A',
    artist: 'Artist A',
    sourceUrl: 'https://example.com/clear-service-a.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const result = await clearQueuedItems(guild.id);
  const snapshot = getQueueSnapshot(guild.id);

  assert.equal(result.cleared, 2);
  assert.equal(snapshot.current?.label, 'Current Track');
  assert.equal(snapshot.queued.length, 0);
});

test('queue snapshot exposes music items alongside speech items', async () => {
  const guild = createGuild('guild-music');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Lo-Fi Radio',
    sourceUrl: 'https://example.com/live.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'English (United States)',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const snapshot = getQueueSnapshot('guild-music');

  assert.equal(snapshot.current?.kind, 'music');
  assert.equal(snapshot.current?.label, 'Lo-Fi Radio');
  assert.equal(snapshot.queued[0]?.kind, 'speech');
  assert.equal(snapshot.queued[0]?.label, 'English (United States)');
});

test('bulk music enqueue accepts playlist-sized batches without tripping per-track limits', async () => {
  const guild = createGuild('guild-playlist');

  const result = await enqueueMusicRequests({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'playlist-user',
    idleDisconnectMs: 60000,
    notifications: {},
    source: 'music',
    tracks: Array.from({ length: 5 }, (_, index) => ({
      title: `Track ${index + 1}`,
      artist: 'Playlist Artist',
      durationMs: 180000,
      sourceUrl: `https://example.com/track-${index + 1}.mp3`,
      sourceType: 'direct-url'
    }))
  });

  const snapshot = await waitForCurrentTrack('guild-playlist');

  assert.equal(result.count, 5);
  assert.equal(result.firstPosition, 1);
  assert.equal(snapshot.current?.label, 'Track 1');
  assert.equal(snapshot.queued.length, 4);
  assert.deepEqual(snapshot.queued.map((item) => item.label), ['Track 2', 'Track 3', 'Track 4', 'Track 5']);
});

test('bulk music enqueue can insert tracks to play next ahead of the current queue', async () => {
  const guild = createGuild('guild-insert-next');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-insert.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'Speech Slot',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track A',
    artist: 'Artist A',
    sourceUrl: 'https://example.com/insert-a.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const result = await enqueueMusicRequests({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    idleDisconnectMs: 60000,
    notifications: {},
    source: 'music',
    placement: 'next',
    tracks: [
      {
        title: 'Inserted 1',
        artist: 'Artist I',
        durationMs: 180000,
        sourceUrl: 'https://example.com/inserted-1.mp3',
        sourceType: 'direct-url'
      },
      {
        title: 'Inserted 2',
        artist: 'Artist I',
        durationMs: 180000,
        sourceUrl: 'https://example.com/inserted-2.mp3',
        sourceType: 'direct-url'
      }
    ]
  });

  const snapshot = getQueueSnapshot(guild.id);

  assert.equal(result.count, 2);
  assert.equal(result.firstPosition, 2);
  assert.equal(result.lastPosition, 3);
  assert.equal(snapshot.current?.label, 'Current Track');
  assert.deepEqual(snapshot.queued.map((item) => item.label), ['Inserted 1', 'Inserted 2', 'Speech Slot', 'Track A']);
});

test('shuffleQueuedMusic shuffles only queued music items and preserves speech positions', async () => {
  const guild = createGuild('guild-shuffle');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'Speech Slot',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track A',
    artist: 'Artist A',
    sourceUrl: 'https://example.com/a.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track B',
    artist: 'Artist B',
    sourceUrl: 'https://example.com/b.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const result = await shuffleQueuedMusic('guild-shuffle');
    const snapshot = getQueueSnapshot('guild-shuffle');

    assert.equal(result.shuffled, true);
    assert.deepEqual(snapshot.queued.map((item) => item.label), ['Speech Slot', 'Track B', 'Track A']);
    assert.equal(snapshot.queued[0].kind, 'speech');
  } finally {
    Math.random = originalRandom;
  }
});

test('unshuffleQueuedMusic restores the previous queued music order while preserving speech positions', async () => {
  const guild = createGuild('guild-unshuffle');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-unshuffle.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'Speech Slot',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track A',
    artist: 'Artist A',
    sourceUrl: 'https://example.com/unshuffle-a.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track B',
    artist: 'Artist B',
    sourceUrl: 'https://example.com/unshuffle-b.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    await shuffleQueuedMusic('guild-unshuffle');
  } finally {
    Math.random = originalRandom;
  }

  const shuffledSnapshot = getQueueSnapshot('guild-unshuffle');
  assert.deepEqual(shuffledSnapshot.queued.map((item) => item.label), ['Speech Slot', 'Track B', 'Track A']);

  const result = await unshuffleQueuedMusic('guild-unshuffle');
  const restoredSnapshot = getQueueSnapshot('guild-unshuffle');

  assert.equal(result.restored, true);
  assert.deepEqual(restoredSnapshot.queued.map((item) => item.label), ['Speech Slot', 'Track A', 'Track B']);
});

test('removeQueuedItemAtPosition removes the visible queue position', async () => {
  const guild = createGuild('guild-remove-position');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-2.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'Speech Slot',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track B',
    artist: 'Artist B',
    sourceUrl: 'https://example.com/remove-b.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const result = await removeQueuedItemAtPosition('guild-remove-position', 2);
  const snapshot = getQueueSnapshot('guild-remove-position');

  assert.equal(result.removed, true);
  assert.equal(result.item.label, 'Track B');
  assert.deepEqual(snapshot.queued.map((item) => item.label), ['Speech Slot']);
});

test('moveQueuedItem reorders upcoming items by visible queue position', async () => {
  const guild = createGuild('guild-move');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-move-2.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'Speech Slot',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track B',
    artist: 'Artist B',
    sourceUrl: 'https://example.com/move-b.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const result = await moveQueuedItem('guild-move', 2, 1);
  const snapshot = getQueueSnapshot('guild-move');

  assert.equal(result.moved, true);
  assert.equal(result.item.label, 'Track B');
  assert.deepEqual(snapshot.queued.map((item) => item.label), ['Track B', 'Speech Slot']);
});

test('skipToQueuedPosition drops earlier queued items and keeps the target next', async () => {
  const guild = createGuild('guild-skipto');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-3.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'Speech Slot',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track B',
    artist: 'Artist B',
    sourceUrl: 'https://example.com/skip-b.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track C',
    artist: 'Artist C',
    sourceUrl: 'https://example.com/skip-c.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const result = await skipToQueuedPosition('guild-skipto', 3, {
    stopPlayback: () => true
  });
  const snapshot = getQueueSnapshot('guild-skipto');

  assert.equal(result.skipped, true);
  assert.equal(result.discardedCount, 2);
  assert.equal(result.target.label, 'Track C');
  assert.deepEqual(snapshot.queued.map((item) => item.label), ['Track C']);
});

test('replayPreviousTrack reports when there is no last played music track yet', async () => {
  const result = await replayPreviousTrack('guild-no-previous', {
    requesterId: 'listener-user',
    notifications: {}
  });

  assert.equal(result.replayed, false);
  assert.equal(result.reason, 'no-previous');
});
