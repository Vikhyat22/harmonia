import test from 'node:test';
import assert from 'node:assert/strict';
import { speakCommand } from '../src/commands/speak.js';
import {
  clearPendingRequests,
  getPendingRequest
} from '../src/services/requestStore.js';

test.afterEach(() => {
  clearPendingRequests();
});

test('speak command defers immediately before doing any other work', async () => {
  const callOrder = [];

  const interaction = {
    guildId: 'guild-1',
    guild: { id: 'guild-1' },
    user: { id: 'user-1' },
    member: { voice: { channel: { id: 'voice-1' } } },
    options: {
      getString(name) {
        callOrder.push('getString');
        return name === 'text' ? 'hello' : null;
      },
      getChannel() {
        callOrder.push('getChannel');
        return null;
      }
    },
    async deferReply() {
      callOrder.push('deferReply');
    },
    async editReply() {
      callOrder.push('editReply');
    }
  };

  await speakCommand.execute(interaction);

  assert.deepEqual(callOrder, ['getString', 'getString', 'deferReply', 'getChannel', 'editReply']);
});

test('speak command stores full multiline text without echoing it into message content', async () => {
  const text = `Line one\nLine two\n${'x'.repeat(2500)}`;
  let deferredPayload = null;
  let replyPayload = null;

  const interaction = {
    guildId: 'guild-1',
    guild: { id: 'guild-1' },
    user: { id: 'user-1' },
    member: { voice: { channel: { id: 'voice-1' } } },
    options: {
      getString(name, required) {
        if (name === 'text') {
          assert.equal(required, true);
          return text;
        }

        assert.equal(name, 'language');
        return null;
      },
      getChannel() {
        return null;
      }
    },
    async deferReply(payload) {
      deferredPayload = payload;
    },
    async editReply(payload) {
      replyPayload = payload;
    }
  };

  await speakCommand.execute(interaction);

  assert.deepEqual(deferredPayload, { flags: 64 });
  assert.ok(replyPayload, 'expected an interaction reply');
  assert.equal(replyPayload.content.includes(text), false);
  assert.match(replyPayload.content, new RegExp(`${text.length}-character message`));

  const selectRow = replyPayload.components[0].toJSON();
  const selectMenu = selectRow.components[0];
  const requestId = selectMenu.custom_id.split(':')[1];
  const storedRequest = getPendingRequest(requestId);

  assert.ok(storedRequest, 'expected a pending request to be created');
  assert.equal(storedRequest.text, text);
  assert.equal(storedRequest.voiceChannelId, 'voice-1');
  assert.equal(selectMenu.options.length, 25);
});

test('speak command requires the user to be in a voice channel', async () => {
  let deferredPayload = null;
  let replyPayload = null;

  const interaction = {
    member: { voice: null },
    options: {
      getString(name) {
        return name === 'text' ? 'hello' : null;
      },
      getChannel() {
        return null;
      }
    },
    async deferReply(payload) {
      deferredPayload = payload;
    },
    async editReply(payload) {
      replyPayload = payload;
    }
  };

  await speakCommand.execute(interaction);

  assert.deepEqual(deferredPayload, { flags: 64 });
  assert.deepEqual(replyPayload, {
    content: '❌ Join a voice channel first, or use the optional `channel` argument in `/speak`.'
  });
});

test('speak command falls back to the fetched guild member voice state', async () => {
  let replyPayload = null;
  let fetchOptions = null;

  const interaction = {
    guildId: 'guild-1',
    guild: {
      members: {
        async fetch(options) {
          fetchOptions = options;
          return {
            voice: {
              channel: { id: 'voice-from-fetch' }
            }
          };
        }
      }
    },
    user: { id: 'user-1' },
    member: {},
    options: {
      getString(name) {
        return name === 'text' ? 'hello from fallback' : null;
      },
      getChannel() {
        return null;
      }
    },
    async deferReply() {},
    async editReply(payload) {
      replyPayload = payload;
    }
  };

  await speakCommand.execute(interaction);

  assert.deepEqual(fetchOptions, {
    user: 'user-1',
    force: true
  });
  assert.match(replyPayload.content, /character message/);

  const selectRow = replyPayload.components[0].toJSON();
  const selectMenu = selectRow.components[0];
  const requestId = selectMenu.custom_id.split(':')[1];
  const storedRequest = getPendingRequest(requestId);

  assert.equal(storedRequest.voiceChannelId, 'voice-from-fetch');
});

test('speak command uses the explicitly selected voice channel when provided', async () => {
  let replyPayload = null;

  const interaction = {
    guildId: 'guild-1',
    user: { id: 'user-1' },
    member: {},
    client: {
      guilds: {
        async fetch(guildId) {
          assert.equal(guildId, 'guild-1');
          return {
            id: guildId,
            channels: {
              cache: new Map(),
              async fetch() {
                return null;
              }
            }
          };
        }
      }
    },
    options: {
      getString(name) {
        return name === 'text' ? 'hello from selected channel' : null;
      },
      getChannel(name) {
        assert.equal(name, 'channel');
        return {
          id: 'voice-picked',
          name: 'General Voice'
        };
      }
    },
    async deferReply() {},
    async editReply(payload) {
      replyPayload = payload;
    }
  };

  await speakCommand.execute(interaction);

  const selectRow = replyPayload.components[0].toJSON();
  const selectMenu = selectRow.components[0];
  const requestId = selectMenu.custom_id.split(':')[1];
  const storedRequest = getPendingRequest(requestId);

  assert.equal(storedRequest.voiceChannelId, 'voice-picked');
});
