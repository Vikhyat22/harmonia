import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { getDataDir, getDataFilePath } from '../src/services/dataPaths.js';

test('data path helpers use the configured DATA_DIR when present', () => {
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = '/var/data/tts-bot';

  assert.equal(getDataDir(), '/var/data/tts-bot');
  assert.equal(getDataFilePath('guild-settings.json'), '/var/data/tts-bot/guild-settings.json');

  if (previous === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = previous;
  }
});

test('data path helpers default to the repo data directory', () => {
  const previous = process.env.DATA_DIR;
  delete process.env.DATA_DIR;

  assert.equal(getDataDir(), path.join(process.cwd(), 'data'));

  if (previous === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = previous;
  }
});
