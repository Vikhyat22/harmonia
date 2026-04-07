import { SlashCommandBuilder } from '../lib/discord.js';
import { getCurrentQueueItem, skipCurrentSpeech } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { errEmbed, mutedEmbed } from '../utils/embed.js';
import { syncMusicRequestController } from '../utils/musicRequestChannel.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

export const skipCommand = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current item and continue with the queue'),

  async execute(interaction) {
    const current = getCurrentQueueItem(interaction.guildId);
    if (!current) {
      return interaction.reply({ embeds: [mutedEmbed('Nothing is playing right now.')], flags: 64 });
    }

    const settings = await getGuildSettings(interaction.guildId);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings, {
      requesterId: current.requesterId,
      allowRequester: true
    });
    if (!access.allowed) {
      return interaction.reply({ embeds: [errEmbed(getPlaybackControlError(settings, { allowRequester: true }))], flags: 64 });
    }

    const skipped = skipCurrentSpeech(interaction.guildId);

    if (!skipped) {
      return interaction.reply({ embeds: [mutedEmbed('Nothing is playing right now.')], flags: 64 });
    }

    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});

    return interaction.reply({ embeds: [mutedEmbed('⏭ Skipped.')], flags: 64 });
  }
};
