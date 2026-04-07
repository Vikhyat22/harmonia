import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../src/lib/sqlite.js';
import { handleMessageCreate } from '../src/handlers/messageCreate.js';
import { getCurrentQueueItem } from '../src/services/queue.js';
import { updateGuildSettings } from '../src/services/settingsStore.js';

function useTempDataDir(t) {
  const previous = process.env.DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmonia-message-create-'));

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

function createTextChannel(id = 'music-requests') {
  const sentPayloads = [];
  const storedMessages = new Map();

  return {
    id,
    sentPayloads,
    isTextBased() {
      return true;
    },
    async send(payload) {
      sentPayloads.push(payload);
      const message = {
        id: `controller-${sentPayloads.length}`,
        async edit(nextPayload) {
          message.lastEdit = nextPayload;
        },
        async delete() {
          storedMessages.delete(message.id);
        }
      };
      storedMessages.set(message.id, message);
      return message;
    },
    messages: {
      async fetch(messageId) {
        const message = storedMessages.get(messageId);
        if (!message) {
          throw new Error('Message not found');
        }
        return message;
      }
    }
  };
}

function createGuild(guildId, requestChannel) {
  return {
    id: guildId,
    channels: {
      cache: new Map([[requestChannel.id, requestChannel]]),
      async fetch() {
        return new Promise(() => {});
      }
    }
  };
}

async function waitForCurrentTrack(guildId, attempts = 20) {
  for (let index = 0; index < attempts; index += 1) {
    const current = getCurrentQueueItem(guildId);
    if (current) {
      return current;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  return null;
}

test('handleMessageCreate queues music requests sent in the configured request channel', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guildId = 'guild-request-channel';
  const requestChannel = createTextChannel('channel-request');
  const guild = createGuild(guildId, requestChannel);
  const reactions = [];
  const replies = [];

  await updateGuildSettings(guildId, {
    musicRequestChannelId: requestChannel.id
  });

  const message = {
    guildId,
    guild,
    channelId: requestChannel.id,
    channel: requestChannel,
    content: 'https://example.com/tum-hi-ho.mp3',
    author: {
      id: 'user-1',
      bot: false
    },
    member: {
      voice: {
        channel: {
          id: 'voice-1',
          name: 'Voice One'
        }
      },
      permissions: {
        has() {
          return false;
        }
      },
      roles: {
        cache: new Map()
      }
    },
    async react(emoji) {
      reactions.push(emoji);
    },
    async reply(payload) {
      replies.push(payload);
    }
  };

  await handleMessageCreate(message);

  const current = await waitForCurrentTrack(guildId);
  assert.ok(current, 'expected a queued track to become current');
  assert.equal(current.title, 'tum hi ho');
  assert.equal(current.requesterId, 'user-1');
  assert.deepEqual(reactions, ['🎵']);
  assert.equal(replies.length, 0);
  assert.equal(requestChannel.sentPayloads.length, 1);
});

test('handleMessageCreate warns when a request-channel message is sent without joining voice first', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guildId = 'guild-request-channel-no-voice';
  const requestChannel = createTextChannel('channel-request-no-voice');
  const guild = createGuild(guildId, requestChannel);
  const replies = [];

  await updateGuildSettings(guildId, {
    musicRequestChannelId: requestChannel.id
  });

  const message = {
    guildId,
    guild,
    channelId: requestChannel.id,
    channel: requestChannel,
    content: 'Tum Hi Ho',
    author: {
      id: 'user-2',
      bot: false
    },
    member: {
      voice: {
        channel: null
      },
      permissions: {
        has() {
          return false;
        }
      },
      roles: {
        cache: new Map()
      }
    },
    async reply(payload) {
      replies.push(payload);
    }
  };

  await handleMessageCreate(message);

  assert.equal(replies.length, 1);
  assert.equal(replies[0].content, '❌ Join a voice channel first to queue music here.');
  assert.equal(getCurrentQueueItem(guildId), null);
});
