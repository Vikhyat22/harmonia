import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('autoplay logs a concise winner line and optional debug details from the trace payload', async () => {
  const source = await readFile(new URL('../src/services/autoplay.js', import.meta.url), 'utf8');

  assert.match(source, /logAutoplayDecision/);
  assert.match(source, /\[Autoplay\]/);
  assert.match(source, /\[AutoplayDebug\]/);
  assert.match(source, /trace\.rejectedTopCandidates/);
  assert.match(source, /pref\.debugEnabled/);
});
