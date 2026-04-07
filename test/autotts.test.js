import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containsBlockedWord,
  sanitizeAutoTtsContent,
  shouldHandleAutoTtsMessage
} from '../src/utils/autoTts.js';

test('sanitizeAutoTtsContent removes links, mentions, and markdown noise', () => {
  const result = sanitizeAutoTtsContent('Hello <@123> visit https://example.com **now**');

  assert.equal(result, 'Hello mention visit now');
});

test('containsBlockedWord matches blocked phrases case-insensitively', () => {
  assert.equal(containsBlockedWord('This contains BaD WoRd inside', ['bad word']), true);
  assert.equal(containsBlockedWord('This is clean', ['bad word']), false);
});

test('shouldHandleAutoTtsMessage only accepts configured guild text messages', () => {
  const message = {
    guildId: 'guild-1',
    channelId: 'channel-1',
    content: 'Hello world',
    author: { bot: false }
  };

  assert.equal(shouldHandleAutoTtsMessage(message, { autoTtsChannelIds: ['channel-1'] }), true);
  assert.equal(shouldHandleAutoTtsMessage(message, { autoTtsChannelIds: ['channel-2'] }), false);
});
