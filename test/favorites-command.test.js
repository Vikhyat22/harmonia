import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../src/lib/sqlite.js';
import { commands } from '../src/commands/index.js';
import { favoriteCommand } from '../src/commands/favorite.js';
import { favoritesCommand } from '../src/commands/favorites.js';
import { enqueueMusicRequest, getCurrentQueueItem, getQueueSnapshot } from '../src/services/queue.js';
import { getFavorites } from '../src/services/musicCatalog.js';

function useTempDataDir(t) {
  const previous = process.env.DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmonia-favorites-command-'));

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

function createInteraction({
  guildId = 'guild-favorites-command',
  userId = 'user-1',
  subcommand = 'list',
  position = null,
  limit = null
} = {}) {
  let replyPayload = null;

  return {
    guildId,
    user: {
      id: userId
    },
    options: {
      getSubcommand() {
        return subcommand;
      },
      getInteger(name) {
        if (name === 'position') {
          return position;
        }

        if (name === 'limit') {
          return limit;
        }

        return null;
      },
      getChannel() {
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

async function waitForCurrentTrack(guildId, attempts = 10) {
  for (let index = 0; index < attempts; index += 1) {
    if (getCurrentQueueItem(guildId)) {
      return getCurrentQueueItem(guildId);
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  return null;
}

test('favorite commands are registered', () => {
  const names = commands.map((command) => command.data.name);

  assert.ok(names.includes('favorite'));
  assert.ok(names.includes('favorites'));
});

test('favorite and favorites commands expose the expected subcommands', () => {
  assert.deepEqual(
    favoriteCommand.data.toJSON().options?.map((option) => option.name),
    ['add', 'remove']
  );

  assert.deepEqual(
    favoritesCommand.data.toJSON().options?.map((option) => option.name),
    ['list', 'play', 'next', 'remove']
  );
});

test('favorite add reports when no music is playing', async () => {
  const interaction = createInteraction({
    guildId: 'guild-no-current',
    subcommand: 'add'
  });

  await favoriteCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Play a music track first/i);
});

test('favorite add saves the current music track', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = {
    id: 'guild-save-current',
    channels: {
      cache: new Map(),
      fetch: async () => new Promise(() => {})
    }
  };

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
    guildId: guild.id,
    userId: 'user-1',
    subcommand: 'add'
  });

  await favoriteCommand.execute(interaction);

  const favorites = getFavorites(guild.id, 'user-1');
  assert.equal(favorites.length, 1);
  assert.equal(favorites[0].title, 'Tum Hi Ho');
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Saved \*\*Tum Hi Ho\*\*/);
});

test('favorites list reports when nothing is saved yet', async () => {
  const interaction = createInteraction({
    guildId: 'guild-empty-favorites',
    subcommand: 'list'
  });

  await favoritesCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /no saved favorites yet/i);
});

function createPlayableGuild(id) {
  return {
    id,
    channels: {
      cache: new Map(),
      fetch: async () => new Promise(() => {})
    }
  };
}

function createPlaybackInteraction({
  guild,
  subcommand = 'next',
  position = 1
} = {}) {
  const voiceChannel = {
    id: 'voice-1',
    isVoiceBased() {
      return true;
    }
  };

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
      username: 'Tester'
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
      getSubcommand() {
        return subcommand;
      },
      getInteger(name) {
        return name === 'position' ? position : null;
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

test('favorites next inserts a saved favorite ahead of the existing queue', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createPlayableGuild('guild-favorite-next');
  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'user-1',
    title: 'Saved Favorite',
    artist: 'Artist A',
    sourceUrl: 'https://cdn.example.com/saved-favorite.mp3',
    sourceType: 'direct-url',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await waitForCurrentTrack(guild.id);

  const addInteraction = createInteraction({
    guildId: guild.id,
    userId: 'user-1',
    subcommand: 'add'
  });
  await favoriteCommand.execute(addInteraction);

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'user-1',
    title: 'Existing Next Track',
    artist: 'Artist B',
    sourceUrl: 'https://cdn.example.com/existing-next-favorite.mp3',
    sourceType: 'direct-url',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const interaction = createPlaybackInteraction({
    guild,
    subcommand: 'next',
    position: 1
  });

  await favoritesCommand.execute(interaction);

  const snapshot = getQueueSnapshot(guild.id);
  assert.deepEqual(interaction.deferred, { flags: 64 });
  assert.match(interaction.editReplyPayload.embeds[0].toJSON().description, /Inserted favorite \*\*Saved Favorite\*\* to play next/i);
  assert.equal(snapshot.current?.label, 'Saved Favorite');
  assert.deepEqual(snapshot.queued.map((item) => item.label), ['Saved Favorite', 'Existing Next Track']);
});
