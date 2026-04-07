import { SlashCommandBuilder } from '../lib/discord.js';
import { clearQueuedItems } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { errEmbed, okEmbed, mutedEmbed } from '../utils/embed.js';
import { syncMusicRequestController } from '../utils/musicRequestChannel.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

export const clearQueueCommand = {
  data: new SlashCommandBuilder()
    .setName('clearqueue')
    .setDescription('Clear upcoming queued items without stopping the current playback'),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings);
    if (!access.allowed) {
      return interaction.reply({ embeds: [errEmbed(getPlaybackControlError(settings))], flags: 64 });
    }

    const result = await clearQueuedItems(interaction.guildId);

    if (result.cleared === 0) {
      return interaction.reply({
        embeds: [mutedEmbed('There are no queued items to clear right now.')],
        flags: 64
      });
    }

    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});

    return interaction.reply({
      embeds: [okEmbed(`🗑 Cleared **${result.cleared}** upcoming queued item(s).`)],
      flags: 64
    });
  }
};
