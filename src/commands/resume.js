import { SlashCommandBuilder } from '../lib/discord.js';
import { getCurrentQueueItem, resumeCurrentPlayback } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { errEmbed, okEmbed, mutedEmbed } from '../utils/embed.js';
import { syncMusicRequestController } from '../utils/musicRequestChannel.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

export const resumeCommand = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the current music or TTS playback'),

  async execute(interaction) {
    const current = getCurrentQueueItem(interaction.guildId);
    if (current) {
      const settings = await getGuildSettings(interaction.guildId);
      const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings, {
        requesterId: current.requesterId,
        allowRequester: true
      });
      if (!access.allowed) {
        return interaction.reply({
          embeds: [errEmbed(getPlaybackControlError(settings, { allowRequester: true }))],
          flags: 64
        });
      }
    }

    const resumed = resumeCurrentPlayback(interaction.guildId);
    if (resumed) {
      await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});
    }
    return interaction.reply({
      embeds: [resumed ? okEmbed('▶ Resumed playback.') : mutedEmbed('Nothing is paused right now.')],
      flags: 64
    });
  }
};
