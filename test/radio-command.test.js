import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb } from '../src/lib/sqlite.js';
import { commands } from '../src/commands/index.js';
import { radioCommand } from '../src/commands/radio.js';
import { getAutoplayPreference, setAutoplayPreference } from '../src/services/musicCatalog.js';

function useTempDataDir(t) {
  const previous = process.env.DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmonia-radio-command-'));

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

function createInteraction({ state = null, debug = null } = {}) {
  let replyPayload = null;

  return {
    guildId: 'guild-radio-1',
    options: {
      getString(name) {
        switch (name) {
          case 'state':
            return state;
          case 'debug':
            return debug;
          default:
            return null;
        }
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

test('radio command is registered and exposes state/debug options', () => {
  const names = commands.map((command) => command.data.name);
  assert.ok(names.includes('radio'));

  const payload = radioCommand.data.toJSON();
  assert.equal(payload.name, 'radio');
  assert.deepEqual(
    payload.options?.map((option) => option.name),
    ['state', 'debug']
  );
});

test('radio command enables autoplay in radio mode by default', { concurrency: false }, async (t) => {
  useTempDataDir(t);
  const interaction = createInteraction();

  await radioCommand.execute(interaction);

  const preference = getAutoplayPreference('guild-radio-1');
  assert.equal(preference.enabled, true);
  assert.equal(preference.mode, 'radio');
  assert.equal(preference.debugEnabled, false);

  assert.equal(interaction.replyPayload.flags, 64);
  const description = interaction.replyPayload.embeds[0].toJSON().description;
  assert.match(description, /Radio autoplay is \*\*on\*\*/);
  assert.match(description, /Mode: \*\*Radio\*\*/);
  assert.match(description, /Debug logs: \*\*Off\*\*/);
});

test('radio command can save radio mode while turning autoplay off and preserving debug choice', { concurrency: false }, async (t) => {
  useTempDataDir(t);
  setAutoplayPreference('guild-radio-1', {
    enabled: true,
    mode: 'artist-continuity',
    debugEnabled: false
  });

  const interaction = createInteraction({
    state: 'off',
    debug: 'on'
  });

  await radioCommand.execute(interaction);

  const preference = getAutoplayPreference('guild-radio-1');
  assert.equal(preference.enabled, false);
  assert.equal(preference.mode, 'radio');
  assert.equal(preference.debugEnabled, true);

  const description = interaction.replyPayload.embeds[0].toJSON().description;
  assert.match(description, /autoplay is \*\*off\*\*/i);
  assert.match(description, /Mode: \*\*Radio\*\*/);
  assert.match(description, /Debug logs: \*\*On\*\*/);
});
