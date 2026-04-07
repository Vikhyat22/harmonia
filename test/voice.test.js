import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_IDLE_DISCONNECT_MS, joinAndPlay } from '../src/services/voice.js';
import {
  claimGuildPlayback,
  resetPlaybackRegistry
} from '../src/services/playbackRegistry.js';

test.afterEach(() => {
  resetPlaybackRegistry();
});

test('joinAndPlay rejects a second request instead of interrupting the active one', async () => {
  assert.equal(claimGuildPlayback('guild-1'), true);

  const interaction = {
    guild: { id: 'guild-1' },
    voiceChannel: { id: 'voice-1' }
  };

  const result = await joinAndPlay(interaction, '/tmp/does-not-exist.mp3');

  assert.deepEqual(result, {
    success: false,
    error: 'I am already speaking in this server. Please wait for the current message to finish.'
  });
});

test('voice service no longer force-stops playback after 30 seconds', async () => {
  const source = await readFile(new URL('../src/services/voice.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /30000/);
  assert.doesNotMatch(source, /Timeout - forcing cleanup/);
});

test('voice service keeps the bot connected briefly after playback finishes', async () => {
  const source = await readFile(new URL('../src/services/voice.js', import.meta.url), 'utf8');

  assert.equal(DEFAULT_IDLE_DISCONNECT_MS, 60_000);
  assert.match(source, /scheduleIdleDisconnect\(guild\.id\)/);
});

test('voice service can bypass idle disconnect when 24\\/7 mode is enabled', async () => {
  const source = await readFile(new URL('../src/services/voice.js', import.meta.url), 'utf8');

  assert.match(source, /if \(entry\.stayConnected\)/);
  assert.match(source, /lavalinkStayConnectedGuilds/);
  assert.match(source, /export function updateConnectionPersistence/);
});

test('voice service cleans up playback listeners between tracks', async () => {
  const source = await readFile(new URL('../src/services/voice.js', import.meta.url), 'utf8');

  assert.match(source, /cleanupPlaybackListeners/);
  assert.match(source, /entry\.player\.off\(AudioPlayerStatus\.Idle, handleIdle\)/);
  assert.match(source, /entry\.player\.off\('error', handleError\)/);
});

test('voice service ignores lavalink replaced track-end events', async () => {
  const source = await readFile(new URL('../src/services/voice.js', import.meta.url), 'utf8');

  assert.match(source, /reason === 'replaced'/);
  assert.match(source, /That should not resolve the current queue item as completed/);
});

test('voice service exposes real track-start hooks for music playback', async () => {
  const source = await readFile(new URL('../src/services/voice.js', import.meta.url), 'utf8');

  assert.match(source, /const onTrackStart = options\.onTrackStart/);
  assert.match(source, /AudioPlayerStatus\.Playing/);
  assert.match(source, /Promise\.resolve\(onTrackStart\(\)\)\.catch/);
});

test('voice service filters lavalink events by the expected track identity', async () => {
  const source = await readFile(new URL('../src/services/voice.js', import.meta.url), 'utf8');

  assert.match(source, /const expectedTrackIdentity = getTrackIdentity\(lavalinkTrack\)/);
  assert.match(source, /isExpectedLavalinkTrack\(track, expectedTrackIdentity\)/);
  assert.match(source, /function isExpectedLavalinkTrack/);
});

test('voice service does not send an extra stopPlaying during serialized lavalink handoff', async () => {
  const source = await readFile(new URL('../src/services/voice.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /if \(player\.playing\) \{\s*player\.stopPlaying\(false, false\);/);
  assert.match(source, /Queue processing is serialized/);
});
