import { SlashCommandBuilder } from '../lib/discord.js';
import { moveQueuedItem } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { errEmbed, mutedEmbed, okEmbed } from '../utils/embed.js';
import { syncMusicRequestController } from '../utils/musicRequestChannel.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

export const moveCommand = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a queued item to a different upcoming position')
    .addIntegerOption((option) =>
      option
        .setName('from')
        .setDescription('Current queue position from /queue > Up Next')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('to')
        .setDescription('New queue position from /queue > Up Next')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings);
    if (!access.allowed) {
      return interaction.reply({ embeds: [errEmbed(getPlaybackControlError(settings))], flags: 64 });
    }

    const fromPosition = interaction.options.getInteger('from', true);
    const toPosition = interaction.options.getInteger('to', true);
    const result = await moveQueuedItem(interaction.guildId, fromPosition, toPosition);

    if (!result.moved) {
      const message = result.reason === 'queue-empty'
        ? 'The upcoming queue is empty.'
        : 'One of those queue positions does not exist right now.';

      return interaction.reply({
        embeds: [mutedEmbed(message)],
        flags: 64
      });
    }

    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});

    if (result.unchanged) {
      return interaction.reply({
        embeds: [mutedEmbed(`**${result.item.label}** is already at position **${result.fromPosition}**.`)],
        flags: 64
      });
    }

    return interaction.reply({
      embeds: [okEmbed(`↕️ Moved **${result.item.label}** from **${result.fromPosition}** to **${result.toPosition}**.`)],
      flags: 64
    });
  }
};
