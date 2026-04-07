import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../src/lib/sqlite.js';
import { handleMusicControls } from '../src/handlers/musicControls.js';
import { updateGuildSettings } from '../src/services/settingsStore.js';
import { enqueueMusicRequest, enqueueSpeechRequest, getQueueSnapshot } from '../src/services/queue.js';
import { setActiveMusicControlMessage } from '../src/utils/musicControls.js';

function useTempDataDir(t) {
  const previous = process.env.DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmonia-music-controls-'));

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

function createControlInteraction({
  guild,
  messageId,
  customId = 'music:stop:ctrl',
  userId = 'user-1',
  canManageGuild = false,
  roleIds = [],
  values = [],
  selectMenu = false
}) {
  let replyPayload = null;
  let followUpPayload = null;
  let updatePayload = null;
  let deferred = false;

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
    user: {
      id: userId
    },
    message: {
      id: messageId
    },
    customId,
    values,
    isButton() {
      return !selectMenu;
    },
    isStringSelectMenu() {
      return selectMenu;
    },
    async reply(payload) {
      replyPayload = payload;
    },
    async followUp(payload) {
      followUpPayload = payload;
    },
    async update(payload) {
      updatePayload = payload;
    },
    async deferUpdate() {
      deferred = true;
    },
    get replyPayload() {
      return replyPayload;
    },
    get followUpPayload() {
      return followUpPayload;
    },
    get updatePayload() {
      return updatePayload;
    },
    get deferred() {
      return deferred;
    }
  };
}

async function seedQueue(guild) {
  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'dj-user',
    title: 'Main Rahoon Ya Na Rahoon',
    artist: 'Armaan Malik',
    sourceUrl: 'https://example.com/current-track.mp3',
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

  return waitForCurrentTrack(guild.id);
}

test('stale now-playing card buttons are rejected and do not affect the current queue', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createGuild('guild-stale-controls');
  await seedQueue(guild);
  await updateGuildSettings(guild.id, {
    musicControllerMessageId: 'controller-current'
  });
  setActiveMusicControlMessage(guild.id, 'live-now-playing');

  const interaction = createControlInteraction({
    guild,
    messageId: 'old-zaroorat-card'
  });

  const handled = await handleMusicControls(interaction);
  const snapshot = getQueueSnapshot(guild.id);

  assert.equal(handled, true);
  assert.deepEqual(interaction.updatePayload, { components: [] });
  assert.match(interaction.followUpPayload.content, /older track/i);
  assert.equal(snapshot.current?.label, 'Main Rahoon Ya Na Rahoon');
  assert.equal(snapshot.queued.length, 1);
});

test('current controller buttons still control the live queue', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createGuild('guild-live-controls');
  await seedQueue(guild);
  await updateGuildSettings(guild.id, {
    musicControllerMessageId: 'controller-current'
  });

  const interaction = createControlInteraction({
    guild,
    messageId: 'controller-current'
  });

  const handled = await handleMusicControls(interaction);
  const snapshot = getQueueSnapshot(guild.id);

  assert.equal(handled, true);
  assert.equal(interaction.deferred, true);
  assert.equal(snapshot.current?.label, 'Main Rahoon Ya Na Rahoon');
  assert.equal(snapshot.queued.length, 0);
});

test('active now-playing card buttons still control the live queue', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createGuild('guild-live-now-playing');
  await seedQueue(guild);
  setActiveMusicControlMessage(guild.id, 'current-now-playing-card');

  const interaction = createControlInteraction({
    guild,
    messageId: 'current-now-playing-card'
  });

  const handled = await handleMusicControls(interaction);
  const snapshot = getQueueSnapshot(guild.id);

  assert.equal(handled, true);
  assert.equal(interaction.deferred, true);
  assert.equal(snapshot.current?.label, 'Main Rahoon Ya Na Rahoon');
  assert.equal(snapshot.queued.length, 0);
});

test('dj-protected stop button is denied for non-dj users', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createGuild('guild-dj-stop-denied');
  await seedQueue(guild);
  await updateGuildSettings(guild.id, {
    musicControllerMessageId: 'controller-current',
    djRoleId: 'dj-role-1'
  });

  const interaction = createControlInteraction({
    guild,
    messageId: 'controller-current',
    userId: 'listener-user',
    canManageGuild: false
  });

  const handled = await handleMusicControls(interaction);
  const snapshot = getQueueSnapshot(guild.id);

  assert.equal(handled, true);
  assert.match(interaction.replyPayload.content, /Only a DJ\/admin can do that/i);
  assert.equal(interaction.deferred, false);
  assert.equal(snapshot.current?.label, 'Main Rahoon Ya Na Rahoon');
  assert.equal(snapshot.queued.length, 1);
});

test('dj-protected skip button is denied for non-requesters', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createGuild('guild-dj-skip-denied');
  await seedQueue(guild);
  await updateGuildSettings(guild.id, {
    musicControllerMessageId: 'controller-current',
    djRoleId: 'dj-role-1'
  });

  const interaction = createControlInteraction({
    guild,
    messageId: 'controller-current',
    customId: 'music:skip:ctrl',
    userId: 'listener-user',
    canManageGuild: false
  });

  const handled = await handleMusicControls(interaction);
  const snapshot = getQueueSnapshot(guild.id);

  assert.equal(handled, true);
  assert.match(interaction.replyPayload.content, /current requester or a DJ\/admin/i);
  assert.equal(interaction.deferred, false);
  assert.equal(snapshot.current?.label, 'Main Rahoon Ya Na Rahoon');
  assert.equal(snapshot.queued.length, 1);
});

test('dj users can remove other queued tracks from the queue select menu', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const guild = createGuild('guild-dj-remove-allowed');
  await seedQueue(guild);
  await enqueueMusicRequest({
    guild,
    voiceChannelId: 'voice-1',
    requesterId: 'queued-owner',
    title: 'Queued Track',
    artist: 'Artist B',
    sourceUrl: 'https://example.com/queued-track.mp3',
    idleDisconnectMs: 60000,
    notifications: {}
  });
  await updateGuildSettings(guild.id, {
    djRoleId: 'dj-role-1'
  });

  const interaction = createControlInteraction({
    guild,
    messageId: 'queue-message',
    customId: 'music:remove:ctrl',
    userId: 'dj-user',
    roleIds: ['dj-role-1'],
    values: ['2'],
    selectMenu: true
  });

  const handled = await handleMusicControls(interaction);
  const snapshot = getQueueSnapshot(guild.id);

  assert.equal(handled, true);
  assert.match(interaction.replyPayload.content, /Removed \*\*Queued Track\*\* from the queue/i);
  assert.equal(snapshot.queued.length, 1);
  assert.equal(snapshot.queued[0]?.label, 'Speech Slot');
});
