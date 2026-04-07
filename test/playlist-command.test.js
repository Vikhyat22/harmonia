import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../src/lib/sqlite.js';
import { commands } from '../src/commands/index.js';
import { playlistCommand } from '../src/commands/playlist.js';
import { enqueueMusicRequest, getCurrentQueueItem, getQueueSnapshot } from '../src/services/queue.js';
import { getPlaylist, savePlaylist } from '../src/services/playlistStore.js';

function useTempDataDir(t) {
  const previous = process.env.DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmonia-playlist-command-'));

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

function createGuild(id) {
  return {
    id,
    channels: {
      cache: new Map(),
      fetch: async () => new Promise(() => {})
    }
  };
}

function createInteraction({
  guildId = 'guild-playlist-command',
  userId = 'user-1',
  subcommand = 'list',
  name = null,
  from = null,
  to = null,
  position = null,
  limit = null
} = {}) {
  let replyPayload = null;

  return {
    guildId,
    user: { id: userId },
    options: {
      getSubcommand() {
        return subcommand;
      },
      getString(optionName) {
        if (optionName === 'name') {
          return name;
        }
        if (optionName === 'from') {
          return from;
        }
        if (optionName === 'to') {
          return to;
        }
        return null;
      },
      getInteger(optionName) {
        if (optionName === 'position') {
          return position;
        }
        if (optionName === 'limit') {
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

test('playlist command is registered with save/list/play/delete subcommands', () => {
  const names = commands.map((command) => command.data.name);
  assert.ok(names.includes('playlist'));

  assert.deepEqual(
    playlistCommand.data.toJSON().options?.map((option) => option.name),
    ['save', 'add', 'append-queue', 'list', 'view', 'play', 'next', 'rename', 'remove-track', 'delete']
  );
});

test('playlist save stores the current queued music tracks under a name', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createGuild('guild-playlist-save');
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

  await waitForCurrentTrack(guild.id);

  const interaction = createInteraction({
    guildId: guild.id,
    userId: 'user-1',
    subcommand: 'save',
    name: 'Hindi Nights'
  });

  await playlistCommand.execute(interaction);

  const playlist = getPlaylist(guild.id, 'user-1', 'hindi nights');
  assert.ok(playlist);
  assert.equal(playlist.trackCount, 1);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Saved \*\*Hindi Nights\*\*/);
});

test('playlist list reports when nothing is saved yet', async () => {
  const interaction = createInteraction({
    guildId: 'guild-playlist-empty',
    subcommand: 'list'
  });

  await playlistCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /no saved playlists yet/i);
});

test('playlist view shows the saved tracks for a named playlist', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  savePlaylist('guild-playlist-view', 'user-1', 'Night Drive', [
    {
      title: 'Track One',
      artist: 'Artist A',
      sourceUrl: 'https://cdn.example.com/track-one.mp3'
    },
    {
      title: 'Track Two',
      artist: 'Artist B',
      sourceUrl: 'https://cdn.example.com/track-two.mp3'
    }
  ]);

  const interaction = createInteraction({
    guildId: 'guild-playlist-view',
    userId: 'user-1',
    subcommand: 'view',
    name: 'Night Drive'
  });

  await playlistCommand.execute(interaction);

  const embed = interaction.replyPayload.embeds[0].toJSON();
  assert.equal(interaction.replyPayload.flags, 64);
  assert.equal(embed.title, 'Night Drive');
  assert.match(embed.description, /1\. \*\*\[Track One\]/);
  assert.match(embed.description, /2\. \*\*\[Track Two\]/);
});

test('playlist view reports when the playlist does not exist', async () => {
  const interaction = createInteraction({
    guildId: 'guild-playlist-view-missing',
    userId: 'user-1',
    subcommand: 'view',
    name: 'Unknown Mix'
  });

  await playlistCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /couldn’t find a playlist named/i);
});

test('playlist add creates a playlist from the current music track when needed', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createPlayableGuild('guild-playlist-add');
  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'user-1',
    title: 'Current Song',
    artist: 'Artist A',
    sourceUrl: 'https://cdn.example.com/current-song.mp3',
    sourceType: 'direct-url',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await waitForCurrentTrack(guild.id);

  const interaction = createInteraction({
    guildId: guild.id,
    userId: 'user-1',
    subcommand: 'add',
    name: 'Mix Tape'
  });

  await playlistCommand.execute(interaction);

  const playlist = getPlaylist(guild.id, 'user-1', 'Mix Tape');
  assert.ok(playlist);
  assert.equal(playlist.trackCount, 1);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Created \*\*Mix Tape\*\* and added \*\*Current Song\*\*/);
});

test('playlist append-queue creates a playlist from the current music queue when needed', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createPlayableGuild('guild-playlist-append-create');
  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'user-1',
    title: 'Current Song',
    artist: 'Artist A',
    sourceUrl: 'https://cdn.example.com/current-song-append.mp3',
    sourceType: 'direct-url',
    idleDisconnectMs: 60000,
    notifications: {}
  });
  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'user-1',
    title: 'Next Song',
    artist: 'Artist B',
    sourceUrl: 'https://cdn.example.com/next-song-append.mp3',
    sourceType: 'direct-url',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await waitForCurrentTrack(guild.id);

  const interaction = createInteraction({
    guildId: guild.id,
    userId: 'user-1',
    subcommand: 'append-queue',
    name: 'Mix Tape'
  });

  await playlistCommand.execute(interaction);

  const playlist = getPlaylist(guild.id, 'user-1', 'Mix Tape');
  assert.ok(playlist);
  assert.equal(playlist.trackCount, 2);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Created \*\*Mix Tape\*\* and appended \*\*2\*\* queued track\(s\)/);
});

test('playlist append-queue appends the current queue onto an existing playlist', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createPlayableGuild('guild-playlist-append-existing');
  savePlaylist(guild.id, 'user-1', 'Night Drive', [
    {
      title: 'Saved Song',
      artist: 'Saved Artist',
      sourceUrl: 'https://cdn.example.com/saved-song.mp3'
    }
  ]);

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'user-1',
    title: 'Current Song',
    artist: 'Artist A',
    sourceUrl: 'https://cdn.example.com/current-song-existing.mp3',
    sourceType: 'direct-url',
    idleDisconnectMs: 60000,
    notifications: {}
  });
  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'user-1',
    title: 'Next Song',
    artist: 'Artist B',
    sourceUrl: 'https://cdn.example.com/next-song-existing.mp3',
    sourceType: 'direct-url',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await waitForCurrentTrack(guild.id);

  const interaction = createInteraction({
    guildId: guild.id,
    userId: 'user-1',
    subcommand: 'append-queue',
    name: 'Night Drive'
  });

  await playlistCommand.execute(interaction);

  const playlist = getPlaylist(guild.id, 'user-1', 'Night Drive');
  assert.ok(playlist);
  assert.equal(playlist.trackCount, 3);
  assert.deepEqual(playlist.tracks.map((track) => track.title), ['Saved Song', 'Current Song', 'Next Song']);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Appended \*\*2\*\* queued track\(s\) to \*\*Night Drive\*\*/);
});

test('playlist rename changes the saved playlist name', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  savePlaylist('guild-playlist-rename', 'user-1', 'Old Name', [
    {
      title: 'Tum Hi Ho',
      artist: 'Arijit Singh',
      sourceUrl: 'https://cdn.example.com/tum-hi-ho.mp3'
    }
  ]);

  const interaction = createInteraction({
    guildId: 'guild-playlist-rename',
    userId: 'user-1',
    subcommand: 'rename',
    from: 'Old Name',
    to: 'New Name'
  });

  await playlistCommand.execute(interaction);

  assert.equal(getPlaylist('guild-playlist-rename', 'user-1', 'Old Name'), null);
  assert.ok(getPlaylist('guild-playlist-rename', 'user-1', 'New Name'));
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Renamed \*\*Old Name\*\* to \*\*New Name\*\*/);
});

test('playlist remove-track removes a saved track by position', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  savePlaylist('guild-playlist-remove-track', 'user-1', 'Night Drive', [
    {
      title: 'Track One',
      artist: 'Artist A',
      sourceUrl: 'https://cdn.example.com/track-one.mp3'
    },
    {
      title: 'Track Two',
      artist: 'Artist B',
      sourceUrl: 'https://cdn.example.com/track-two.mp3'
    }
  ]);

  const interaction = createInteraction({
    guildId: 'guild-playlist-remove-track',
    userId: 'user-1',
    subcommand: 'remove-track',
    name: 'Night Drive',
    position: 2
  });

  await playlistCommand.execute(interaction);

  const playlist = getPlaylist('guild-playlist-remove-track', 'user-1', 'Night Drive');
  assert.equal(playlist.trackCount, 1);
  assert.equal(playlist.tracks[0].title, 'Track One');
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Removed \*\*Track Two\*\* from \*\*Night Drive\*\*/);
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
  name = null
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
    user: { id: 'user-1' },
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
    member: {
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
      getString(optionName) {
        return optionName === 'name' ? name : null;
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

test('playlist next inserts a saved playlist ahead of the existing queue', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createPlayableGuild('guild-playlist-next');
  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'user-1',
    title: 'Playlist Seed',
    artist: 'Artist A',
    sourceUrl: 'https://cdn.example.com/playlist-seed.mp3',
    sourceType: 'direct-url',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  await waitForCurrentTrack(guild.id);

  const saveInteraction = createInteraction({
    guildId: guild.id,
    userId: 'user-1',
    subcommand: 'save',
    name: 'Direct Queue'
  });
  await playlistCommand.execute(saveInteraction);

  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'user-1',
    title: 'Existing Next Track',
    artist: 'Artist B',
    sourceUrl: 'https://cdn.example.com/existing-next-playlist.mp3',
    sourceType: 'direct-url',
    idleDisconnectMs: 60000,
    notifications: {}
  });

  const interaction = createPlaybackInteraction({
    guild,
    subcommand: 'next',
    name: 'Direct Queue'
  });

  await playlistCommand.execute(interaction);

  const snapshot = getQueueSnapshot(guild.id);
  assert.deepEqual(interaction.deferred, { flags: 64 });
  assert.match(interaction.editReplyPayload.embeds[0].toJSON().description, /Inserted playlist \*\*Direct Queue\*\* with \*\*1\*\* track\(s\) to play next/i);
  assert.equal(snapshot.current?.label, 'Playlist Seed');
  assert.deepEqual(snapshot.queued.map((item) => item.label), ['Playlist Seed', 'Existing Next Track']);
});
