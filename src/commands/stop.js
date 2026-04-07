import { SlashCommandBuilder } from '../lib/discord.js';
import { stopAndClearGuildQueue } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { errEmbed, okEmbed, mutedEmbed } from '../utils/embed.js';
import { syncMusicRequestController } from '../utils/musicRequestChannel.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

export const stopCommand = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop current playback and clear the queue'),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings);
    if (!access.allowed) {
      return interaction.reply({ embeds: [errEmbed(getPlaybackControlError(settings))], flags: 64 });
    }

    const result = await stopAndClearGuildQueue(interaction.guildId);

    if (!result.stoppedCurrent && result.cleared === 0) {
      return interaction.reply({ embeds: [mutedEmbed('Nothing is playing or queued right now.')], flags: 64 });
    }

    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});

    if (!result.stoppedCurrent && result.cleared > 0) {
      return interaction.reply({ embeds: [okEmbed(`🗑 Cleared **${result.cleared}** queued item(s).`)], flags: 64 });
    }

    const extra = result.cleared > 0 ? ` Cleared **${result.cleared}** queued item(s).` : '';
    return interaction.reply({ embeds: [okEmbed(`⏹ Stopped playback.${extra}`)], flags: 64 });
  }
};
