import test from 'node:test';
import assert from 'node:assert/strict';
import { commands } from '../src/commands/index.js';
import { insertCommand } from '../src/commands/insert.js';
import { enqueueMusicRequest, getQueueSnapshot } from '../src/services/queue.js';

function createGuild(id, voiceChannel) {
  return {
    id,
    channels: {
      cache: new Map(),
      fetch: async () => new Promise(() => {})
    }
  };
}

function createInteraction({ guild, voiceChannel, query, title = null }) {
  let deferred = null;
  let editReplyPayload = null;

  return {
    guildId: guild.id,
    guild,
    channel: {
      id: 'text-1',
      async send() {},
      messages: {
        async fetch() {
          throw new Error('not found');
        }
      },
      isTextBased() {
        return true;
      }
    },
    user: {
      id: 'user-1',
      username: 'Tester',
      displayAvatarURL() {
        return 'https://example.com/avatar.png';
      }
    },
    member: {
      displayName: 'Tester',
      voice: {
        channel: voiceChannel
      },
      permissions: {
        has() {
          return true;
        }
      },
      roles: {
        cache: new Map()
      }
    },
    options: {
      getString(name, required = false) {
        if (name === 'query') {
          return query;
        }

        if (name === 'title') {
          return title;
        }

        return required ? '' : null;
      },
      getChannel() {
        return null;
      }
    },
    async deferReply(payload) {
      deferred = payload;
    },
    async editReply(payload) {
      editReplyPayload = payload;
    },
    get deferred() {
      return deferred;
    },
    get editReplyPayload() {
      return editReplyPayload;
    }
  };
}

async function waitForCurrentTrack(guildId, attempts = 10) {
  for (let index = 0; index < attempts; index += 1) {
    const snapshot = getQueueSnapshot(guildId);
    if (snapshot.current) {
      return snapshot;
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  return getQueueSnapshot(guildId);
}

test('insert command is registered', () => {
  const names = commands.map((command) => command.data.name);
  assert.ok(names.includes('insert'));
  assert.equal(insertCommand.data.toJSON().name, 'insert');
});

test('insert command places a direct audio track before the existing upcoming queue', async () => {
  const voiceChannel = {
    id: 'voice-1',
    isVoiceBased() {
      return true;
    }
  };
  const guild = createGuild('guild-insert-command', voiceChannel);

  await enqueueMusicRequest({
    guild,
    voiceChannelId: voiceChannel.id,
    requesterId: 'dj-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-insert-command.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: voiceChannel.id,
    requesterId: 'dj-user',
    title: 'Existing Next Track',
    artist: 'Artist 1',
    sourceUrl: 'https://example.com/existing-next.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await waitForCurrentTrack(guild.id);

  const interaction = createInteraction({
    guild,
    voiceChannel,
    query: 'https://cdn.example.com/inserted-track.mp3',
    title: 'Inserted Track'
  });

  await insertCommand.execute(interaction);

  const snapshot = getQueueSnapshot(guild.id);

  assert.deepEqual(interaction.deferred, { flags: 64 });
  assert.match(interaction.editReplyPayload.embeds[0].toJSON().description, /Inserted \*\*Inserted Track\*\* to play next/i);
  assert.equal(snapshot.current?.label, 'Current Track');
  assert.deepEqual(snapshot.queued.map((item) => item.label), ['Inserted Track', 'Existing Next Track']);
});
