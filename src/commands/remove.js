import { SlashCommandBuilder } from '../lib/discord.js';
import { getQueueSnapshot, removeQueuedItemAtPosition } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { errEmbed, mutedEmbed, okEmbed } from '../utils/embed.js';
import { syncMusicRequestController } from '../utils/musicRequestChannel.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

export const removeCommand = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove an item from the upcoming queue by position')
    .addIntegerOption((option) =>
      option
        .setName('position')
        .setDescription('Queue position from /queue > Up Next')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  async execute(interaction) {
    const position = interaction.options.getInteger('position', true);
    const snapshot = getQueueSnapshot(interaction.guildId);
    const target = snapshot.queued[position - 1] ?? null;

    if (target) {
      const settings = await getGuildSettings(interaction.guildId);
      const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings, {
        requesterId: target.requesterId,
        allowRequester: true
      });
      if (!access.allowed) {
        return interaction.reply({ embeds: [errEmbed(getPlaybackControlError(settings, { allowRequester: true }))], flags: 64 });
      }
    }

    const result = await removeQueuedItemAtPosition(interaction.guildId, position);

    if (!result.removed) {
      const message = result.reason === 'queue-empty'
        ? 'The upcoming queue is empty.'
        : `There is no queued item at position **${position}**.`;

      return interaction.reply({
        embeds: [mutedEmbed(message)],
        flags: 64
      });
    }

    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});

    return interaction.reply({
      embeds: [okEmbed(`🗑 Removed **${result.item.label}** from position **${result.position}**.`)],
      flags: 64
    });
  }
};
