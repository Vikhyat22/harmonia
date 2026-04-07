import { SlashCommandBuilder, EmbedBuilder } from '../lib/discord.js';
import { getCurrentQueueItem } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { getLavalinkPlayer } from '../services/voice.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

const COLOR_OK = 0x56c7a7;
const COLOR_ERR = 0xe37d6f;
const COLOR_MUTED = 0x4f545c;

export const restartCommand = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Restart the current music track from the beginning'),

  async execute(interaction) {
    const player = getLavalinkPlayer(interaction.guildId);
    const current = getCurrentQueueItem(interaction.guildId);

    if (!player?.queue?.current) {
      if (current?.kind === 'speech') {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLOR_MUTED).setDescription('Only music tracks can be restarted right now.')],
          flags: 64
        });
      }

      if (current?.kind === 'music') {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor(COLOR_MUTED).setDescription('This track does not support restarting.')],
          flags: 64
        });
      }

      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription('❌ Nothing is playing right now.')],
        flags: 64
      });
    }

    const durationMs = player.queue.current?.info?.duration ?? null;
    if (!durationMs) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_MUTED).setDescription('This track does not support restarting.')],
        flags: 64
      });
    }

    const settings = await getGuildSettings(interaction.guildId);
    const access = getPlaybackControlDecision(interaction.member, interaction.user.id, settings, {
      requesterId: current?.requesterId ?? null,
      allowRequester: true
    });
    if (!access.allowed) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription(getPlaybackControlError(settings, { allowRequester: true }))],
        flags: 64
      });
    }

    const title = player.queue.current?.info?.title ?? current?.title ?? 'current track';

    try {
      await player.seek(0);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_OK).setDescription(`↺ Restarted **${title}** from the beginning.`)],
        flags: 64
      });
    } catch {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription('❌ Failed to restart the current track.')],
        flags: 64
      });
    }
  }
};
