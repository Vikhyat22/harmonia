import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../src/lib/sqlite.js';
import { commands } from '../src/commands/index.js';
import { musicChannelCommand } from '../src/commands/musicchannel.js';
import { getGuildSettings } from '../src/services/settingsStore.js';

function useTempDataDir(t) {
  const previous = process.env.DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmonia-musicchannel-'));

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
    name: id,
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

function createInteraction({ guildId = 'guild-musicchannel', subcommand = 'set', channel = null } = {}) {
  let replyPayload = null;
  const textChannel = channel ?? createTextChannel();
  const guild = {
    id: guildId,
    channels: {
      cache: new Map([[textChannel.id, textChannel]]),
      async fetch(channelId) {
        return this.cache.get(channelId) ?? null;
      }
    }
  };

  return {
    guildId,
    guild,
    channel: textChannel,
    member: {
      permissions: {
        has() {
          return true;
        }
      }
    },
    options: {
      getSubcommand() {
        return subcommand;
      },
      getChannel(name) {
        return name === 'channel' ? textChannel : null;
      }
    },
    async reply(payload) {
      replyPayload = payload;
    },
    get replyPayload() {
      return replyPayload;
    }
  };
}

test('musicchannel command is registered with the expected subcommands', () => {
  const names = commands.map((command) => command.data.name);
  assert.ok(names.includes('musicchannel'));

  const payload = musicChannelCommand.data.toJSON();
  assert.equal(payload.name, 'musicchannel');
  assert.deepEqual(
    payload.options?.map((option) => option.name),
    ['set', 'refresh', 'disable', 'status']
  );
});

test('/musicchannel set saves the request channel and posts a controller message', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const channel = createTextChannel('channel-music');
  const interaction = createInteraction({
    guildId: 'guild-set-musicchannel',
    subcommand: 'set',
    channel
  });

  await musicChannelCommand.execute(interaction);

  const settings = await getGuildSettings('guild-set-musicchannel');
  assert.equal(settings.musicRequestChannelId, 'channel-music');
  assert.equal(settings.musicControllerMessageId, 'controller-1');
  assert.equal(channel.sentPayloads.length, 1);
  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Music requests are now enabled/i);
});

test('/musicchannel status shows the configured channel', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const channel = createTextChannel('channel-status');
  const setInteraction = createInteraction({
    guildId: 'guild-status-musicchannel',
    subcommand: 'set',
    channel
  });
  await musicChannelCommand.execute(setInteraction);

  const statusInteraction = createInteraction({
    guildId: 'guild-status-musicchannel',
    subcommand: 'status',
    channel
  });
  await musicChannelCommand.execute(statusInteraction);

  const payload = statusInteraction.replyPayload.embeds[0].toJSON();
  const requestChannelField = payload.fields.find((field) => field.name === 'Request Channel');
  assert.equal(requestChannelField.value, '<#channel-status>');
});
