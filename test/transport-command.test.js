import test from 'node:test';
import assert from 'node:assert/strict';
import { commands } from '../src/commands/index.js';
import { forwardCommand } from '../src/commands/forward.js';
import { rewindCommand } from '../src/commands/rewind.js';
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

function createInteraction(guildId, seconds = null) {
  let replyPayload = null;

  return {
    guildId,
    options: {
      getInteger(name) {
        if (name === 'seconds') {
          return seconds;
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

async function waitForReplyState(attempts = 10) {
  for (let index = 0; index < attempts; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('transport commands are registered', () => {
  const names = commands.map((command) => command.data.name);

  assert.ok(names.includes('rewind'));
  assert.ok(names.includes('forward'));
  assert.equal(rewindCommand.data.toJSON().name, 'rewind');
  assert.equal(forwardCommand.data.toJSON().name, 'forward');
  assert.equal(rewindCommand.data.toJSON().options?.[0]?.name, 'seconds');
  assert.equal(forwardCommand.data.toJSON().options?.[0]?.name, 'seconds');
});

test('rewind command reports when nothing is playing', async () => {
  const interaction = createInteraction('guild-rewind-empty');

  await rewindCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Nothing is playing right now/i);
});

test('forward command reports when nothing is playing', async () => {
  const interaction = createInteraction('guild-forward-empty');

  await forwardCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Nothing is playing right now/i);
});

test('rewind command reports that TTS cannot be rewound', async () => {
  const guild = createGuild('guild-rewind-speech');

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

  await waitForReplyState();

  const interaction = createInteraction(guild.id);
  await rewindCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Only music tracks can be rewound/i);
});

test('forward command reports that TTS cannot be forwarded', async () => {
  const guild = createGuild('guild-forward-speech');

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

  await waitForReplyState();

  const interaction = createInteraction(guild.id);
  await forwardCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Only music tracks can be forwarded/i);
});
