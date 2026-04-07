import { SlashCommandBuilder } from '../lib/discord.js';
import { shuffleQueuedMusic } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { errEmbed, mutedEmbed, okEmbed } from '../utils/embed.js';
import { syncMusicRequestController } from '../utils/musicRequestChannel.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

export const shuffleCommand = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle queued music tracks while keeping TTS items in place'),

  async execute(interaction) {
    const settings = await getGuildSettings(interaction.guildId);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings);
    if (!access.allowed) {
      return interaction.reply({ embeds: [errEmbed(getPlaybackControlError(settings))], flags: 64 });
    }

    const result = await shuffleQueuedMusic(interaction.guildId);

    if (!result.shuffled) {
      const message = result.reason === 'not-enough-music'
        ? 'Add at least two queued music tracks before shuffling.'
        : 'There are no queued music tracks to shuffle right now.';

      return interaction.reply({
        embeds: [mutedEmbed(message)],
        flags: 64
      });
    }

    await syncMusicRequestController(interaction.guild, { channel: interaction.channel }).catch(() => {});

    return interaction.reply({
      embeds: [okEmbed(`🔀 Shuffled **${result.count}** queued music track(s). TTS items stayed in place.`)],
      flags: 64
    });
  }
};
