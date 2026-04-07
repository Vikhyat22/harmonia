import { SlashCommandBuilder } from '../lib/discord.js';
import { getGuildSettings, updateGuildSettings } from '../services/settingsStore.js';
import { getConfiguredAdminError, hasConfiguredAdminAccess } from '../utils/permissions.js';

export const setIdleCommand = {
  data: new SlashCommandBuilder()
    .setName('setidle')
    .setDescription('Set how long the bot stays connected after speaking')
    .addIntegerOption((option) =>
      option
        .setName('seconds')
        .setDescription('Idle timeout in seconds')
        .setRequired(true)
        .setMinValue(15)
        .setMaxValue(600)
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    if (!hasConfiguredAdminAccess(interaction.member, settings)) {
      return interaction.reply({ content: getConfiguredAdminError(), flags: 64 });
    }

    const seconds = interaction.options.getInteger('seconds', true);

    await updateGuildSettings(interaction.guildId, {
      idleDisconnectMs: seconds * 1000
    });

    return interaction.reply({
      content: `✅ Idle disconnect timeout set to ${seconds} seconds.`,
      flags: 64
    });
  }
};
