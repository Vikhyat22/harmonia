import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('autoplay notifications import music controls from the shared controls helper', async () => {
  const source = await readFile(new URL('../src/services/autoplay.js', import.meta.url), 'utf8');

  assert.match(source, /import\('\.\.\/utils\/musicControls\.js'\)/);
  assert.doesNotMatch(source, /import\('\.\.\/handlers\/musicControls\.js'\)/);
});
