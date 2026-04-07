import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTextIntoChunks } from '../src/utils/text.js';
import { buildLanguageAutocompleteChoices, parseLanguageInput } from '../src/utils/languageAutocomplete.js';

test('splitTextIntoChunks preserves content while splitting oversized text', () => {
  const text = 'Hello world. '.repeat(40).trim();
  const chunks = splitTextIntoChunks(text, 60);

  assert.ok(chunks.length > 1);
  assert.equal(chunks.every((chunk) => chunk.length <= 60), true);
  assert.equal(chunks.join(' '), text);
});

test('language autocomplete finds locales by code or name', () => {
  const codeMatches = buildLanguageAutocompleteChoices('en-in');
  const nameMatches = buildLanguageAutocompleteChoices('Hindi');

  assert.equal(codeMatches.some((choice) => choice.value === 'en-IN'), true);
  assert.equal(nameMatches.some((choice) => choice.value === 'hi-IN'), true);
});

test('parseLanguageInput accepts either code or rendered label', () => {
  assert.equal(parseLanguageInput('en-US')?.code, 'en-US');
  assert.equal(parseLanguageInput('English (India) (en-IN)')?.code, 'en-IN');
});
