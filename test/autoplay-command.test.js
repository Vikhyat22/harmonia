import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { autoplayCommand } from '../src/commands/autoplay.js';
import { closeDb } from '../src/lib/sqlite.js';
import {
  DEFAULT_AUTOPLAY_MODE,
  getAutoplayPreference,
  setAutoplayPreference
} from '../src/services/musicCatalog.js';

function useTempDataDir(t) {
  const previous = process.env.DATA_DIR;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harmonia-autoplay-'));

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

function createInteraction({ state = null, mode = null, debug = null } = {}) {
  let replyPayload = null;

  return {
    guildId: 'guild-1',
    options: {
      getString(name) {
        switch (name) {
          case 'state':
            return state;
          case 'mode':
            return mode;
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

test('autoplay preferences expose defaults and merge modern settings onto the legacy boolean setter', { concurrency: false }, (t) => {
  useTempDataDir(t);

  const initial = getAutoplayPreference('guild-1');
  assert.equal(initial.enabled, false);
  assert.equal(initial.mode, DEFAULT_AUTOPLAY_MODE);
  assert.equal(initial.debugEnabled, false);
  assert.equal(initial.seedType, 'history');

  assert.equal(setAutoplayPreference('guild-1', true), true);
  const enabledOnly = getAutoplayPreference('guild-1');
  assert.equal(enabledOnly.enabled, true);
  assert.equal(enabledOnly.mode, DEFAULT_AUTOPLAY_MODE);
  assert.equal(enabledOnly.debugEnabled, false);

  assert.equal(setAutoplayPreference('guild-1', {
    mode: 'radio',
    debugEnabled: true
  }), true);

  const updated = getAutoplayPreference('guild-1');
  assert.equal(updated.enabled, true);
  assert.equal(updated.mode, 'radio');
  assert.equal(updated.debugEnabled, true);
  assert.equal(updated.seed_type, 'history');
});

test('autoplay command exposes state, mode, and debug options', () => {
  const payload = autoplayCommand.data.toJSON();
  const options = payload.options ?? [];

  assert.deepEqual(
    options.map((option) => option.name),
    ['state', 'mode', 'debug']
  );
  assert.deepEqual(
    options.find((option) => option.name === 'mode')?.choices?.map((choice) => choice.value),
    ['strict-original', 'artist-continuity', 'discovery', 'radio']
  );
});

test('autoplay command keeps the no-argument toggle as a compatibility shortcut', { concurrency: false }, async (t) => {
  useTempDataDir(t);
  const interaction = createInteraction();

  await autoplayCommand.execute(interaction);

  const preference = getAutoplayPreference('guild-1');
  assert.equal(preference.enabled, true);
  assert.equal(preference.mode, DEFAULT_AUTOPLAY_MODE);
  assert.equal(preference.debugEnabled, false);

  assert.equal(interaction.replyPayload.flags, 64);
  const description = interaction.replyPayload.embeds[0].toJSON().description;
  assert.match(description, /Autoplay is \*\*on\*\*/);
  assert.match(description, /Mode: \*\*Artist Continuity\*\*/);
  assert.match(description, /Debug logs: \*\*Off\*\*/);
  assert.match(description, /Toggle shortcut used/);
});

test('autoplay command updates mode and debug settings without forcing autoplay on', { concurrency: false }, async (t) => {
  useTempDataDir(t);
  setAutoplayPreference('guild-1', false);

  const interaction = createInteraction({
    mode: 'discovery',
    debug: 'on'
  });

  await autoplayCommand.execute(interaction);

  const preference = getAutoplayPreference('guild-1');
  assert.equal(preference.enabled, false);
  assert.equal(preference.mode, 'discovery');
  assert.equal(preference.debugEnabled, true);

  const description = interaction.replyPayload.embeds[0].toJSON().description;
  assert.match(description, /Autoplay is \*\*off\*\*/);
  assert.match(description, /Mode: \*\*Discovery\*\*/);
  assert.match(description, /Debug logs: \*\*On\*\*/);
  assert.match(description, /Status saved: \*\*Off\*\*/);
});
