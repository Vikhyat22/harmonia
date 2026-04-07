import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../src/lib/sqlite.js';
import { commands } from '../src/commands/index.js';
import { twentyFourSevenCommand } from '../src/commands/247.js';
import { getGuildSettings } from '../src/services/settingsStore.js';

function useTempDataDir(t) {
  const previous = process.env.DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmonia-247-'));

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

function createInteraction({ guildId = 'guild-247', state = null } = {}) {
  let replyPayload = null;

  return {
    guildId,
    member: {
      permissions: {
        has() {
          return true;
        }
      }
    },
    options: {
      getString(name) {
        return name === 'state' ? state : null;
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

test('/247 command is registered and exposes state choices', () => {
  const names = commands.map((command) => command.data.name);
  assert.ok(names.includes('247'));

  const payload = twentyFourSevenCommand.data.toJSON();
  assert.equal(payload.name, '247');
  assert.deepEqual(
    payload.options?.find((option) => option.name === 'state')?.choices?.map((choice) => choice.value),
    ['on', 'off']
  );
});

test('/247 without a state shows the current status', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const interaction = createInteraction();
  await twentyFourSevenCommand.execute(interaction);

  assert.equal(interaction.replyPayload.flags, 64);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /24\/7 mode is \*\*off\*\*/i);
});

test('/247 on saves stayConnected even when no voice channel is available', { concurrency: false }, async (t) => {
  useTempDataDir(t);

  const interaction = createInteraction({
    guildId: 'guild-247-on',
    state: 'on'
  });

  await twentyFourSevenCommand.execute(interaction);

  const settings = await getGuildSettings('guild-247-on');
  assert.equal(settings.stayConnected, true);
  assert.match(interaction.replyPayload.embeds[0].toJSON().description, /Enabled 24\/7 mode/i);
});
