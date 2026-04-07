import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGE_PAGE_SIZE,
  buildSelectOptions,
  getLanguageOptions,
  getLanguagePageCount
} from '../src/utils/languages.js';
import {
  buildLanguageSelectionComponents,
  buildLanguageSelectionContent
} from '../src/utils/languageMenu.js';

test('language catalog exposes unique locale options without fake gender variants', () => {
  const options = getLanguageOptions();
  const codes = options.map((option) => option.code);

  assert.equal(new Set(codes).size, codes.length);
  assert.equal(options.some((option) => /male|female/i.test(option.name)), false);
});

test('language pagination exposes every supported locale across pages', () => {
  const allOptions = getLanguageOptions();
  const totalPages = getLanguagePageCount();
  const pagedOptions = Array.from({ length: totalPages }, (_, page) =>
    buildSelectOptions(page).map((option) => option.value)
  ).flat();

  assert.equal(totalPages, 2);
  assert.equal(buildSelectOptions(0).length, LANGUAGE_PAGE_SIZE);
  assert.deepEqual(pagedOptions, allOptions.map((option) => option.code));
});

test('language menu builder adds page controls when more than one page exists', () => {
  const content = buildLanguageSelectionContent(42, 1);
  const rows = buildLanguageSelectionComponents('req-123', 1);
  const buttonRow = rows[1].toJSON();

  assert.match(content, /Page 2 of 2/);
  assert.equal(rows.length, 2);
  assert.equal(buttonRow.components[0].disabled, false);
  assert.equal(buttonRow.components[1].disabled, true);
});
