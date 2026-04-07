import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, resetRateLimiter } from '../src/services/rateLimiter.js';

test.afterEach(() => {
  resetRateLimiter();
});

test('rate limiter blocks users with too many queued items', () => {
  const result = checkRateLimit({
    guildId: 'guild-1',
    userId: 'user-1',
    queuedCountForUser: 3
  });

  assert.equal(result.allowed, false);
  assert.match(result.error, /queued messages/);
});

test('rate limiter blocks bursts after the allowed number of requests', () => {
  for (let index = 0; index < 3; index += 1) {
    const result = checkRateLimit({
      guildId: 'guild-1',
      userId: 'user-1',
      queuedCountForUser: 0
    });

    assert.equal(result.allowed, true);
  }

  const blocked = checkRateLimit({
    guildId: 'guild-1',
    userId: 'user-1',
    queuedCountForUser: 0
  });

  assert.equal(blocked.allowed, false);
  assert.match(blocked.error, /too quickly/);
});

test('rate limiter uses music-specific messaging and can ignore queue depth for bulk playlist requests', () => {
  const blocked = checkRateLimit({
    guildId: 'guild-1',
    userId: 'user-1',
    queuedCountForUser: 3,
    kind: 'music'
  });

  assert.equal(blocked.allowed, false);
  assert.match(blocked.error, /queued tracks/);

  const bypassed = checkRateLimit({
    guildId: 'guild-1',
    userId: 'user-2',
    queuedCountForUser: 50,
    kind: 'music',
    ignoreQueueDepth: true
  });

  assert.equal(bypassed.allowed, true);
});
