import { SlashCommandBuilder } from '../lib/discord.js';
import { skipToQueuedPosition } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { errEmbed, mutedEmbed, okEmbed } from '../utils/embed.js';
import { syncMusicRequestController } from '../utils/musicRequestChannel.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

export const skipToCommand = {
  data: new SlashCommandBuilder()
    .setName('skipto')
    .setDescription('Skip the current item and jump to a queued position')
    .addIntegerOption((option) =>
      option
        .setName('position')
        .setDescription('Queue position from /queue > Up Next')
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

    const position = interaction.options.getInteger('position', true);
    const result = await skipToQueuedPosition(interaction.guildId, position);

    if (!result.skipped) {
      let message = `There is no queued item at position **${position}**.`;

      if (result.reason === 'nothing-playing') {
        message = 'Nothing is playing right now.';
      } else if (result.reason === 'queue-empty') {
        message = 'The upcoming queue is empty.';
      }

      return interaction.reply({
        embeds: [mutedEmbed(message)],
        flags: 64
      });
    }

    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});

    const detail = result.discardedCount > 0
      ? ` Removed **${result.discardedCount}** queued item(s) before it.`
      : '';

    return interaction.reply({
      embeds: [okEmbed(`⏭ Jumping to **${result.target.label}**.${detail}`)],
      flags: 64
    });
  }
};
