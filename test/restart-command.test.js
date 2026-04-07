import test from 'node:test';
import assert from 'node:assert/strict';
import { commands } from '../src/commands/index.js';
import { restartCommand } from '../src/commands/restart.js';
import { enqueueSpeechRequest } from '../src/services/queue.js';

function createGuild(id) {
  return {
    id,
    channels: {
      cache: new Map(),
      fetch: async () => new Promise(() => {})
    }
  };
}

function createInteraction(guildId) {
  let replyPayload = null;

  return {
    guildId,
    async reply(payload) {
      replyPayload = payload;
    },
    get replyPayload() {
      return replyPayload;
    }
  };
}

async function waitForReplyState(guildId, attempts = 10) {
  for (let index = 0; index < attempts; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  return guildId;
}

test('restart command is registered', () => {
  const names = commands.map((command) => command.data.name);
  assert.ok(names.includes('restart'));
  assert.equal(restartCommand.data.toJSON().name, 'restart');
});

test('restart command reports when nothing is playing', async () => {
  const interaction = createInteraction('guild-restart-empty');

  await restartCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Nothing is playing right now/i);
});

test('restart command reports that TTS cannot be restarted', async () => {
  const guild = createGuild('guild-restart-speech');

  await enqueueSpeechRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'tts-user',
    languageCode: 'en-US',
    voiceName: 'English (United States)',
    chunks: ['hello'],
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await waitForReplyState(guild.id);

  const interaction = createInteraction(guild.id);
  await restartCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Only music tracks can be restarted/i);
});
