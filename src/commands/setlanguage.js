import { SlashCommandBuilder } from '../lib/discord.js';
import { parseLanguageInput, buildLanguageAutocompleteChoices } from '../utils/languageAutocomplete.js';
import { clearDefaultLanguage, getGuildSettings, updateGuildSettings } from '../services/settingsStore.js';
import { getConfiguredAdminError, hasConfiguredAdminAccess } from '../utils/permissions.js';

export const setLanguageCommand = {
  data: new SlashCommandBuilder()
    .setName('setlanguage')
    .setDescription('Set or clear the default TTS language for this server')
    .addStringOption((option) =>
      option
        .setName('language')
        .setDescription('Language code like en-US. Leave blank to clear the default.')
        .setAutocomplete(true)
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    await interaction.respond(buildLanguageAutocompleteChoices(focused));
  },

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    if (!hasConfiguredAdminAccess(interaction.member, settings)) {
      return interaction.reply({ content: getConfiguredAdminError(), flags: 64 });
    }

    const input = interaction.options.getString('language');

    if (!input) {
      await clearDefaultLanguage(interaction.guildId);
      return interaction.reply({
        content: '✅ Cleared the default language for this server.',
        flags: 64
      });
    }

    const language = parseLanguageInput(input);
    if (!language) {
      return interaction.reply({
        content: '❌ Unknown language. Use a supported code like `en-US` or pick from autocomplete.',
        flags: 64
      });
    }

    await updateGuildSettings(interaction.guildId, {
      defaultLanguage: language.code
    });

    return interaction.reply({
      content: `✅ Default language set to ${language.name} (${language.code}).`,
      flags: 64
    });
  }
};
