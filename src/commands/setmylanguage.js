import { SlashCommandBuilder } from '../lib/discord.js';
import { buildLanguageAutocompleteChoices, parseLanguageInput } from '../utils/languageAutocomplete.js';
import { clearUserDefaultLanguage, updateUserSettings } from '../services/userSettingsStore.js';

export const setMyLanguageCommand = {
  data: new SlashCommandBuilder()
    .setName('setmylanguage')
    .setDescription('Set or clear your personal default TTS language')
    .addStringOption((option) =>
      option
        .setName('language')
        .setDescription('Language code like en-US. Leave blank to clear your default.')
        .setAutocomplete(true)
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    await interaction.respond(buildLanguageAutocompleteChoices(focused));
  },

  async execute(interaction) {
    const input = interaction.options.getString('language');

    if (!input) {
      await clearUserDefaultLanguage(interaction.user.id);
      return interaction.reply({
        content: '✅ Cleared your personal default language.',
        flags: 64
      });
    }

    const language = parseLanguageInput(input);
    if (!language) {
      return interaction.reply({
        content: '❌ Unknown language. Pick from autocomplete or use a supported locale code.',
        flags: 64
      });
    }

    await updateUserSettings(interaction.user.id, {
      defaultLanguage: language.code
    });

    return interaction.reply({
      content: `✅ Your default language is now ${language.name} (${language.code}).`,
      flags: 64
    });
  }
};
