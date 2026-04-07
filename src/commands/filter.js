import { SlashCommandBuilder } from '../lib/discord.js';
import { getGuildSettings, updateGuildSettings } from '../services/settingsStore.js';
import { getConfiguredAdminError, hasConfiguredAdminAccess } from '../utils/permissions.js';

function normalizeWord(word) {
  return word.trim().toLowerCase();
}

export const filterCommand = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Manage blocked words for auto-TTS and queued speech')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add a blocked word or phrase')
        .addStringOption((option) =>
          option
            .setName('word')
            .setDescription('Word or phrase to block')
            .setRequired(true)
            .setMaxLength(100)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a blocked word or phrase')
        .addStringOption((option) =>
          option
            .setName('word')
            .setDescription('Word or phrase to unblock')
            .setRequired(true)
            .setMaxLength(100)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Show blocked words and phrases')
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    if (!hasConfiguredAdminAccess(interaction.member, settings)) {
      return interaction.reply({ content: getConfiguredAdminError(), flags: 64 });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      return interaction.reply({
        content: settings.blockedWords.length > 0
          ? `🚫 Blocked words:\n${settings.blockedWords.map((word) => `• ${word}`).join('\n')}`
          : 'No blocked words are configured.',
        flags: 64
      });
    }

    const word = normalizeWord(interaction.options.getString('word', true));
    if (!word) {
      return interaction.reply({ content: '❌ Please provide a non-empty word or phrase.', flags: 64 });
    }

    if (subcommand === 'add') {
      const blockedWords = [...new Set([...settings.blockedWords, word])];
      await updateGuildSettings(interaction.guildId, { blockedWords });
      return interaction.reply({
        content: `✅ Added \`${word}\` to the blocked word list.`,
        flags: 64
      });
    }

    const blockedWords = settings.blockedWords.filter((entry) => entry !== word);
    await updateGuildSettings(interaction.guildId, { blockedWords });
    return interaction.reply({
      content: `✅ Removed \`${word}\` from the blocked word list.`,
      flags: 64
    });
  }
};
