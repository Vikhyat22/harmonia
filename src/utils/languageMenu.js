import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} from '../lib/discord.js';
import {
  buildSelectOptions,
  getLanguagePageCount
} from './languages.js';

export const LANGUAGE_SELECT_PREFIX = 'language_select';
export const LANGUAGE_PAGE_PREFIX = 'language_page';

export function buildLanguageSelectionContent(textLength, page = 0) {
  const totalPages = getLanguagePageCount();
  return `Choose a language for your ${textLength}-character message. Page ${page + 1} of ${totalPages}.`;
}

export function buildLanguageSelectionComponents(requestId, page = 0) {
  const totalPages = getLanguagePageCount();
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);

  const rows = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${LANGUAGE_SELECT_PREFIX}:${requestId}`)
        .setPlaceholder(`Select a language (${safePage + 1}/${totalPages})`)
        .addOptions(buildSelectOptions(safePage))
    )
  ];

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${LANGUAGE_PAGE_PREFIX}:${requestId}:${safePage - 1}`)
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage === 0),
        new ButtonBuilder()
          .setCustomId(`${LANGUAGE_PAGE_PREFIX}:${requestId}:${safePage + 1}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage === totalPages - 1)
      )
    );
  }

  return rows;
}

export function parseLanguageSelectCustomId(customId) {
  const [prefix, requestId] = customId.split(':');
  if (prefix !== LANGUAGE_SELECT_PREFIX || !requestId) {
    return null;
  }

  return { requestId };
}

export function parseLanguagePageCustomId(customId) {
  const [prefix, requestId, rawPage] = customId.split(':');
  const page = Number.parseInt(rawPage, 10);

  if (prefix !== LANGUAGE_PAGE_PREFIX || !requestId || Number.isNaN(page)) {
    return null;
  }

  return { requestId, page };
}
