import { SlashCommandBuilder } from '../lib/discord.js';
import { getGuildSettings, resetGuildSettings } from '../services/settingsStore.js';
import { getConfiguredAdminError, hasConfiguredAdminAccess } from '../utils/permissions.js';

export const resetSettingsCommand = {
  data: new SlashCommandBuilder()
    .setName('resetsettings')
    .setDescription('Reset this server bot configuration back to defaults'),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    if (!hasConfiguredAdminAccess(interaction.member, settings)) {
      return interaction.reply({ content: getConfiguredAdminError(), flags: 64 });
    }

    await resetGuildSettings(interaction.guildId);

    return interaction.reply({
      content: '✅ Server bot settings were reset to defaults.',
      flags: 64
    });
  }
};
