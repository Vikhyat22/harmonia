import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../src/lib/sqlite.js';
import { commands } from '../src/commands/index.js';
import { setDjRoleCommand } from '../src/commands/setdjrole.js';
import { getGuildSettings } from '../src/services/settingsStore.js';

function useTempDataDir(t) {
  const previous = process.env.DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmonia-setdjrole-'));

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

function createInteraction({ guildId = 'guild-setdjrole', role = null, canManageGuild = true } = {}) {
  let replyPayload = null;

  return {
    guildId,
    member: {
      permissions: {
        has() {
          return canManageGuild;
        }
      }
    },
    options: {
      getRole(name) {
        return name === 'role' ? role : null;
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

test('setdjrole command is registered', () => {
  const names = commands.map((command) => command.data.name);

  assert.ok(names.includes('setdjrole'));
  assert.equal(setDjRoleCommand.data.toJSON().name, 'setdjrole');
});

test('setdjrole requires Manage Server permission', async () => {
  const interaction = createInteraction({
    guildId: 'guild-setdjrole-denied',
    canManageGuild: false
  });

  await setDjRoleCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.content, /Manage Server/i);
});

test('setdjrole stores and clears the configured dj role', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const setInteraction = createInteraction({
    guildId: 'guild-setdjrole-save',
    role: { id: 'dj-role-1', toString: () => '<@&dj-role-1>' }
  });

  await setDjRoleCommand.execute(setInteraction);

  const savedSettings = await getGuildSettings('guild-setdjrole-save');
  assert.equal(savedSettings.djRoleId, 'dj-role-1');
  assert.match(setInteraction.replyPayload.content, /DJ role set/i);

  const clearInteraction = createInteraction({
    guildId: 'guild-setdjrole-save',
    role: null
  });

  await setDjRoleCommand.execute(clearInteraction);

  const clearedSettings = await getGuildSettings('guild-setdjrole-save');
  assert.equal(clearedSettings.djRoleId, null);
  assert.match(clearInteraction.replyPayload.content, /Cleared the DJ role/i);
});
