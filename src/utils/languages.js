export const languages = {
  english: {
    label: 'English',
    emoji: '🇺🇸',
    options: [
      { code: 'en-US', name: 'English (United States)' },
      { code: 'en-GB', name: 'English (United Kingdom)' },
      { code: 'en-AU', name: 'English (Australia)' },
      { code: 'en-IN', name: 'English (India)' }
    ]
  },
  indian: {
    label: 'Indian Languages',
    emoji: '🇮🇳',
    options: [
      { code: 'hi-IN', name: 'Hindi' },
      { code: 'bn-IN', name: 'Bengali' },
      { code: 'ta-IN', name: 'Tamil' },
      { code: 'te-IN', name: 'Telugu' },
      { code: 'mr-IN', name: 'Marathi' },
      { code: 'gu-IN', name: 'Gujarati' },
      { code: 'kn-IN', name: 'Kannada' },
      { code: 'ml-IN', name: 'Malayalam' }
    ]
  },
  european: {
    label: 'European',
    emoji: '🇪🇺',
    options: [
      { code: 'es-ES', name: 'Spanish' },
      { code: 'fr-FR', name: 'French' },
      { code: 'de-DE', name: 'German' },
      { code: 'it-IT', name: 'Italian' },
      { code: 'pt-BR', name: 'Portuguese (Brazil)' },
      { code: 'ru-RU', name: 'Russian' },
      { code: 'pl-PL', name: 'Polish' },
      { code: 'nl-NL', name: 'Dutch' }
    ]
  },
  asian: {
    label: 'Asian',
    emoji: '🌏',
    options: [
      { code: 'zh-CN', name: 'Chinese (Simplified)' },
      { code: 'ja-JP', name: 'Japanese' },
      { code: 'ko-KR', name: 'Korean' },
      { code: 'th-TH', name: 'Thai' },
      { code: 'vi-VN', name: 'Vietnamese' },
      { code: 'id-ID', name: 'Indonesian' },
      { code: 'ms-MY', name: 'Malay' },
      { code: 'fil-PH', name: 'Filipino' }
    ]
  },
  middleEastern: {
    label: 'Middle Eastern',
    emoji: '🏜️',
    options: [
      { code: 'ar-SA', name: 'Arabic' },
      { code: 'fa-IR', name: 'Persian' },
      { code: 'he-IL', name: 'Hebrew' },
      { code: 'tr-TR', name: 'Turkish' },
      { code: 'ur-PK', name: 'Urdu' }
    ]
  },
  african: {
    label: 'African',
    emoji: '🌍',
    options: [
      { code: 'af-ZA', name: 'Afrikaans' },
      { code: 'sw-KE', name: 'Swahili' },
      { code: 'zu-ZA', name: 'Zulu' }
    ]
  }
};

const flattenedOptions = Object.values(languages).flatMap((category) =>
  category.options.map((option) => ({
    ...option,
    emoji: category.emoji,
    categoryLabel: category.label
  }))
);

export const LANGUAGE_PAGE_SIZE = 25;

export function getLanguageOptions() {
  return flattenedOptions;
}

export function getLanguageOption(code) {
  return flattenedOptions.find((option) => option.code === code) ?? null;
}

export function getLanguagePageCount(pageSize = LANGUAGE_PAGE_SIZE) {
  return Math.max(1, Math.ceil(flattenedOptions.length / pageSize));
}

export function buildSelectOptions(page = 0, pageSize = LANGUAGE_PAGE_SIZE) {
  const start = page * pageSize;
  const end = start + pageSize;

  return flattenedOptions.slice(start, end).map((option) => ({
    label: option.name,
    value: option.code,
    description: `${option.categoryLabel} • ${option.code}`,
    emoji: option.emoji
  }));
}
