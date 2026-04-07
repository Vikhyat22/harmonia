import { getLanguageOptions, getLanguageOption } from './languages.js';

export function buildLanguageAutocompleteChoices(query = '') {
  const normalized = query.trim().toLowerCase();

  return getLanguageOptions()
    .filter((option) => {
      if (!normalized) return true;

      return option.name.toLowerCase().includes(normalized)
        || option.code.toLowerCase().includes(normalized);
    })
    .slice(0, 25)
    .map((option) => ({
      name: `${option.name} (${option.code})`,
      value: option.code
    }));
}

export function parseLanguageInput(input) {
  if (!input) {
    return null;
  }

  const normalized = input.trim().toLowerCase();

  return getLanguageOptions().find((option) =>
    option.code.toLowerCase() === normalized
    || option.name.toLowerCase() === normalized
    || `${option.name} (${option.code})`.toLowerCase() === normalized
  ) ?? getLanguageOption(input.trim()) ?? null;
}
