import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('queue retries autoplay after a failed autoplay candidate instead of immediately idling out', async () => {
  const source = await readFile(new URL('../src/services/queue.js', import.meta.url), 'utf8');

  assert.match(source, /state\._lastPlayedStatus === 'failed' && lastItem\?\.source === 'autoplay'/);
});

test('queue does not requeue alternate manual search candidates on music playback failure', async () => {
  const source = await readFile(new URL('../src/services/queue.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /function buildRetryTrack/);
  assert.doesNotMatch(source, /state\.items\.unshift\(retryTrack\)/);
});

test('queue can advance to the next verified spotify mirror when the first mirror fails to stream', async () => {
  const source = await readFile(new URL('../src/services/queue.js', import.meta.url), 'utf8');

  assert.match(source, /function advanceSpotifyMirrorFallback/);
  assert.match(source, /function isRetryableSpotifyMirrorFailure/);
  assert.match(source, /isRetryableSpotifyMirrorFailure\(playResult\.error\) && advanceSpotifyMirrorFallback\(item\)/);
  assert.match(source, /notifications\.onRetry/);
});

test('queue can advance to the next autoplay fallback when a related youtube candidate is login blocked', async () => {
  const source = await readFile(new URL('../src/services/queue.js', import.meta.url), 'utf8');

  assert.match(source, /function advanceAutoplayFallback/);
  assert.match(source, /item\.source === 'autoplay' && isRetryableSpotifyMirrorFailure\(playResult\.error\) && advanceAutoplayFallback\(item\)/);
});

test('queue records canonical autoplay memory for completed, skipped, and failed music tracks', async () => {
  const source = await readFile(new URL('../src/services/queue.js', import.meta.url), 'utf8');

  assert.match(source, /recordAutoplayMemoryForItem/);
  assert.match(source, /recordAutoplayMemoryForItem\(item,\s*'played'\)/);
  assert.match(source, /recordAutoplayMemoryForItem\(item,\s*'skipped'\)/);
  assert.match(source, /recordAutoplayMemoryForItem\(item,\s*'failed'\)/);
});
