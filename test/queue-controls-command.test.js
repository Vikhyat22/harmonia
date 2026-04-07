import test from 'node:test';
import assert from 'node:assert/strict';
import { commands } from '../src/commands/index.js';
import { clearQueueCommand } from '../src/commands/clearqueue.js';
import { moveCommand } from '../src/commands/move.js';
import { previousCommand } from '../src/commands/previous.js';
import { removeCommand } from '../src/commands/remove.js';
import { shuffleCommand } from '../src/commands/shuffle.js';
import { skipCommand } from '../src/commands/skip.js';
import { skipToCommand } from '../src/commands/skipto.js';
import { stopCommand } from '../src/commands/stop.js';
import { unshuffleCommand } from '../src/commands/unshuffle.js';
import { enqueueMusicRequest, enqueueSpeechRequest } from '../src/services/queue.js';
import { updateGuildSettings } from '../src/services/settingsStore.js';

function createGuild(id, textChannel = null) {
  return {
    id,
    channels: {
      cache: textChannel ? new Map([[textChannel.id, textChannel]]) : new Map(),
      fetch: async () => new Promise(() => {})
    }
  };
}

function createInteraction({
  guildId,
  position = null,
  from = null,
  to = null,
  userId = 'user-1',
  canManageGuild = true,
  roleIds = []
} = {}) {
  let replyPayload = null;
  const textChannel = {
    id: 'text-1',
    async send() {
      const message = {
        id: 'controller-1',
        async edit() {},
        async delete() {}
      };
      return message;
    },
    messages: {
      async fetch() {
        throw new Error('not found');
      }
    },
    isTextBased() {
      return true;
    }
  };
  const guild = createGuild(guildId, textChannel);

  return {
    guildId,
    guild,
    channel: textChannel,
    user: {
      id: userId
    },
    member: {
      voice: {
        channel: {
          id: 'voice-1'
        }
      },
      permissions: {
        has() {
          return canManageGuild;
        }
      },
      roles: {
        cache: new Map(roleIds.map((id) => [id, { id }]))
      }
    },
    options: {
      getInteger(name) {
        if (name === 'position') {
          return position;
        }

        if (name === 'from') {
          return from;
        }

        if (name === 'to') {
          return to;
        }

        return null;
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

test('queue control commands are registered', () => {
  const names = commands.map((command) => command.data.name);

  assert.ok(names.includes('shuffle'));
  assert.ok(names.includes('unshuffle'));
  assert.ok(names.includes('clearqueue'));
  assert.ok(names.includes('remove'));
  assert.ok(names.includes('skip'));
  assert.ok(names.includes('skipto'));
  assert.ok(names.includes('previous'));
  assert.ok(names.includes('stop'));
  assert.ok(names.includes('move'));
});

test('queue control commands expose the expected slash command options', () => {
  assert.equal(previousCommand.data.toJSON().name, 'previous');
  assert.equal(shuffleCommand.data.toJSON().name, 'shuffle');
  assert.equal(unshuffleCommand.data.toJSON().name, 'unshuffle');
  assert.equal(clearQueueCommand.data.toJSON().name, 'clearqueue');
  assert.equal(moveCommand.data.toJSON().options?.[0]?.name, 'from');
  assert.equal(moveCommand.data.toJSON().options?.[1]?.name, 'to');
  assert.equal(removeCommand.data.toJSON().options?.[0]?.name, 'position');
  assert.equal(skipToCommand.data.toJSON().options?.[0]?.name, 'position');
});

test('remove command removes an item by visible queue position', async () => {
  const guild = createGuild('guild-remove-command');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-command.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'Speech Slot',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const interaction = createInteraction({
    guildId: guild.id,
    position: 1
  });

  await removeCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Removed \*\*Speech Slot\*\* from position \*\*1\*\*/);
});

test('skip command is denied to non-requesters when a dj role is configured', async () => {
  const guild = createGuild('guild-skip-dj-deny');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'owner-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-skip-deny.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await updateGuildSettings(guild.id, {
    djRoleId: 'dj-role-1'
  });

  const interaction = createInteraction({
    guildId: guild.id,
    userId: 'other-user',
    canManageGuild: false
  });

  await skipCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /current requester or a DJ\/admin/i);
});

test('stop command is denied to non-djs when a dj role is configured', async () => {
  const guild = createGuild('guild-stop-dj-deny');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'owner-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-stop-deny.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await updateGuildSettings(guild.id, {
    djRoleId: 'dj-role-1'
  });

  const interaction = createInteraction({
    guildId: guild.id,
    userId: 'other-user',
    canManageGuild: false
  });

  await stopCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Only a DJ\/admin can do that/i);
});

test('shuffle command reports when there is nothing to shuffle', async () => {
  const interaction = createInteraction({
    guildId: 'guild-shuffle-command'
  });

  await shuffleCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /no queued music tracks/i);
});

test('unshuffle command reports when there is no stored shuffle order', async () => {
  const interaction = createInteraction({
    guildId: 'guild-unshuffle-command'
  });

  await unshuffleCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /no queued music tracks to restore/i);
});

test('clearqueue command clears upcoming queued items without stopping current playback', async () => {
  const guild = createGuild('guild-clearqueue-command');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-clear.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'Speech Slot',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track A',
    artist: 'Artist A',
    sourceUrl: 'https://example.com/clear-a.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const interaction = createInteraction({
    guildId: guild.id
  });

  await clearQueueCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Cleared \*\*2\*\* upcoming queued item\(s\)/);
});

test('previous command reports when there is no prior music track to replay', async () => {
  const interaction = createInteraction({
    guildId: 'guild-previous-command'
  });

  await previousCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /no previously played music track/i);
});

test('move command reorders queued items by visible position', async () => {
  const guild = createGuild('guild-move-command');

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Current Track',
    artist: 'Artist 0',
    sourceUrl: 'https://example.com/current-move.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'Speech Slot',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Track A',
    artist: 'Artist A',
    sourceUrl: 'https://example.com/move-a.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const interaction = createInteraction({
    guildId: guild.id,
    from: 2,
    to: 1
  });

  await moveCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Moved \*\*Track A\*\* from \*\*2\*\* to \*\*1\*\*/);
});
