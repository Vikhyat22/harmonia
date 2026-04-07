import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHistoryEntries } from '../src/services/analytics.js';

test('history analytics summarize outcomes, sources, and top dimensions', () => {
  const entries = [
    {
      requesterId: 'user-1',
      languageName: 'English (United States)',
      status: 'completed',
      source: 'slash',
      timestamp: new Date().toISOString()
    },
    {
      requesterId: 'user-1',
      languageName: 'Hindi (India)',
      status: 'failed',
      source: 'auto',
      timestamp: new Date().toISOString()
    },
    {
      requesterId: 'user-2',
      languageName: 'English (United States)',
      status: 'completed',
      source: 'slash',
      timestamp: new Date().toISOString()
    }
  ];

  const summary = summarizeHistoryEntries(entries, { topLimit: 2 });

  assert.equal(summary.totalEntries, 3);
  assert.equal(summary.last24Hours, 3);
  assert.deepEqual(summary.outcomes[0], { key: 'completed', count: 2 });
  assert.deepEqual(summary.sources[0], { key: 'slash', count: 2 });
  assert.deepEqual(summary.languages[0], { key: 'English (United States)', count: 2 });
  assert.deepEqual(summary.requesters[0], { key: 'user-1', count: 2 });
  assert.equal(summary.recentFailures.length, 1);
});
