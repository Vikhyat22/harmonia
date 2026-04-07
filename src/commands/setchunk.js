import { SlashCommandBuilder } from '../lib/discord.js';
import { getGuildSettings, updateGuildSettings } from '../services/settingsStore.js';
import { getConfiguredAdminError, hasConfiguredAdminAccess } from '../utils/permissions.js';

export const setChunkCommand = {
  data: new SlashCommandBuilder()
    .setName('setchunk')
    .setDescription('Set the automatic text chunk length for this server')
    .addIntegerOption((option) =>
      option
        .setName('characters')
        .setDescription('Chunk size in characters')
        .setRequired(true)
        .setMinValue(120)
        .setMaxValue(450)
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    if (!hasConfiguredAdminAccess(interaction.member, settings)) {
      return interaction.reply({ content: getConfiguredAdminError(), flags: 64 });
    }

    const characters = interaction.options.getInteger('characters', true);
    await updateGuildSettings(interaction.guildId, { chunkLength: characters });

    return interaction.reply({
      content: `✅ Automatic chunk length set to ${characters} characters.`,
      flags: 64
    });
  }
};
