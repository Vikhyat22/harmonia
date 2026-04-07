import { SlashCommandBuilder } from '../lib/discord.js';
import { unshuffleQueuedMusic } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { errEmbed, mutedEmbed, okEmbed } from '../utils/embed.js';
import { syncMusicRequestController } from '../utils/musicRequestChannel.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

export const unshuffleCommand = {
  data: new SlashCommandBuilder()
    .setName('unshuffle')
    .setDescription('Restore the queued music order from before the last shuffle'),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings);
    if (!access.allowed) {
      return interaction.reply({ embeds: [errEmbed(getPlaybackControlError(settings))], flags: 64 });
    }

    const result = await unshuffleQueuedMusic(interaction.guildId);

    if (!result.restored) {
      const message = result.reason === 'no-music'
        ? 'There are no queued music tracks to restore right now.'
        : 'The queue has not been shuffled yet.';

      return interaction.reply({
        embeds: [mutedEmbed(message)],
        flags: 64
      });
    }

    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});

    return interaction.reply({
      embeds: [okEmbed(result.unchanged
        ? `↩ Restored the previous queue order for **${result.count}** music track(s).`
        : `↩ Unshuffled **${result.count}** queued music track(s).`)],
      flags: 64
    });
  }
};
