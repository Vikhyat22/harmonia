import test from 'node:test';
import assert from 'node:assert/strict';
import { getAutoplayMemoryEntries, getAutoplayMemorySnapshot, recordAutoplayMemory } from '../src/services/autoplayMemory.js';

test('autoplay memory persists canonical keys for played, skipped, and failed tracks', () => {
  const guildId = `guild-autoplay-memory-${Date.now()}`;

  recordAutoplayMemory(guildId, {
    track: {
      title: 'Shape of You',
      artist: 'Ed Sheeran',
      metadata: { spotifyTrackId: '7qiZfU4dY1lWllzX7mPBI3' }
    },
    action: 'played',
    source: 'manual'
  });

  recordAutoplayMemory(guildId, {
    track: {
      title: 'Shivers',
      artist: 'Ed Sheeran - Topic',
      metadata: {
        identifier: 'abc123xyz',
        sourceName: 'youtube',
        canonicalSourceType: 'youtube'
      }
    },
    action: 'skipped',
    source: 'autoplay'
  });

  recordAutoplayMemory(guildId, {
    track: {
      title: 'Perfect',
      artist: 'Ed Sheeran',
      playbackInput: 'https://www.youtube.com/watch?v=def456uvw'
    },
    action: 'failed',
    source: 'autoplay'
  });

  const entries = getAutoplayMemoryEntries(guildId, 10);
  const snapshot = getAutoplayMemorySnapshot(guildId, 10);

  assert.equal(entries.length, 3);
  assert.ok(snapshot.recentCanonicalKeys.includes('spotify:7qiZfU4dY1lWllzX7mPBI3'));
  assert.ok(snapshot.skippedCanonicalKeys.includes('youtube:abc123xyz'));
  assert.ok(snapshot.failedCanonicalKeys.includes('canonical-url:https://www.youtube.com/watch?v=def456uvw'));
});

test('autoplay memory keeps autoplay artist history in chronological order for streak checks', () => {
  const guildId = `guild-autoplay-artists-${Date.now()}`;

  recordAutoplayMemory(guildId, {
    track: { title: 'Shape of You', artist: 'Ed Sheeran', metadata: { identifier: 'one' } },
    action: 'played',
    source: 'autoplay'
  });
  recordAutoplayMemory(guildId, {
    track: { title: 'Shivers', artist: 'Ed Sheeran - Topic', metadata: { identifier: 'two' } },
    action: 'skipped',
    source: 'autoplay'
  });
  recordAutoplayMemory(guildId, {
    track: { title: 'Perfect', artist: 'Ed Sheeran VEVO', metadata: { identifier: 'three' } },
    action: 'failed',
    source: 'autoplay'
  });
  recordAutoplayMemory(guildId, {
    track: { title: 'Castle on the Hill', artist: 'Ed Sheeran', metadata: { identifier: 'four' } },
    action: 'played',
    source: 'manual'
  });

  const snapshot = getAutoplayMemorySnapshot(guildId, 10);

  assert.deepEqual(snapshot.recentAutoplayArtistKeys, ['ed sheeran', 'ed sheeran']);
  assert.ok(snapshot.recentArtistKeys.includes('ed sheeran'));
});
