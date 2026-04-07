import test from 'node:test';
import assert from 'node:assert/strict';
import { getGuildHistory, recordHistory } from '../src/services/historyStore.js';

test('history store keeps the newest entries first and respects the limit', async () => {
  const guildId = `guild-history-${Date.now()}`;

  await recordHistory(guildId, {
    requesterId: 'user-1',
    languageName: 'English (United States)',
    status: 'completed',
    source: 'slash'
  });

  await recordHistory(guildId, {
    requesterId: 'user-2',
    languageName: 'Hindi (India)',
    status: 'failed',
    source: 'auto'
  });

  const recent = await getGuildHistory(guildId, 1);
  const all = await getGuildHistory(guildId, 10);

  assert.equal(recent.length, 1);
  assert.equal(recent[0].requesterId, 'user-2');
  assert.equal(all.length, 2);
  assert.equal(all[0].requesterId, 'user-2');
  assert.equal(all[1].requesterId, 'user-1');
  assert.match(all[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
