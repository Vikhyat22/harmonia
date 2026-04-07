import test from 'node:test';
import assert from 'node:assert/strict';
import { commands } from '../src/commands/index.js';
import { lyricsCommand } from '../src/commands/lyrics.js';
import { enqueueMusicRequest, getCurrentQueueItem } from '../src/services/queue.js';

function createGuild(id) {
  return {
    id,
    channels: {
      cache: new Map(),
      fetch: async () => new Promise(() => {})
    }
  };
}

function createInteraction({ guildId, query = null } = {}) {
  let replyPayload = null;
  let deferredPayload = null;
  let editReplyPayload = null;

  return {
    guildId,
    options: {
      getString() {
        return query;
      }
    },
    async reply(payload) {
      replyPayload = payload;
    },
    async deferReply(payload) {
      deferredPayload = payload;
    },
    async editReply(payload) {
      editReplyPayload = payload;
    },
    get replyPayload() {
      return replyPayload;
    },
    get deferredPayload() {
      return deferredPayload;
    },
    get editReplyPayload() {
      return editReplyPayload;
    }
  };
}

async function waitForCurrentTrack(guildId, attempts = 10) {
  for (let index = 0; index < attempts; index += 1) {
    if (getCurrentQueueItem(guildId)) {
      return getCurrentQueueItem(guildId);
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  return null;
}

test('lyrics command is registered with an optional query', () => {
  const names = commands.map((command) => command.data.name);
  assert.ok(names.includes('lyrics'));

  const payload = lyricsCommand.data.toJSON();
  assert.equal(payload.name, 'lyrics');
  assert.equal(payload.options?.[0]?.name, 'query');
  assert.equal(payload.options?.[0]?.required, false);
});

test('lyrics command reports when nothing is playing and no query is supplied', async () => {
  const interaction = createInteraction({
    guildId: 'guild-lyrics-empty'
  });

  await lyricsCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Nothing is playing right now/i);
});

test('lyrics command can fetch lyrics for the current playing track', async () => {
  const guild = createGuild('guild-lyrics-current');
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        lyrics: 'Line 1\nLine 2'
      };
    }
  });

  try {
    await enqueueMusicRequest({
      guild,
      voiceChannelId: 'voice-1',
      requesterId: 'user-1',
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      sourceUrl: 'https://www.youtube.com/watch?v=fsiPzT50ZiM',
      sourceType: 'youtube',
      idleDisconnectMs: 60000,
      notifications: {}
    });

    const current = await waitForCurrentTrack(guild.id);
    assert.ok(current);

    const interaction = createInteraction({
      guildId: guild.id
    });

    await lyricsCommand.execute(interaction);

    assert.equal(interaction.deferredPayload.flags, 64);
    assert.match(interaction.editReplyPayload.embeds[0].toJSON().title, /Lyrics • Tum Hi Ho/);
    assert.match(interaction.editReplyPayload.embeds[0].toJSON().description, /Line 1/);
  } finally {
    global.fetch = originalFetch;
  }
});
