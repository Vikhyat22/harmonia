import { SlashCommandBuilder, EmbedBuilder } from '../lib/discord.js';
import { getCurrentQueueItem } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { getLavalinkPlayer } from '../services/voice.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

const COLOR_OK  = 0x56c7a7;
const COLOR_ERR = 0xe37d6f;

export const seekCommand = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Seek to a position in the current track')
    .addStringOption((option) =>
      option
        .setName('time')
        .setDescription('Position to seek to, e.g. "1:30" or "90" (seconds)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const timeStr = interaction.options.getString('time', true);
    const player = getLavalinkPlayer(interaction.guildId);
    const current = getCurrentQueueItem(interaction.guildId);

    if (!player || !player.playing) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription('❌ Nothing is playing right now.')],
        flags: 64
      });
    }

    const durationMs = player.queue.current?.info?.duration ?? null;
    if (!durationMs) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription('❌ This track does not support seeking.')],
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

    const positionMs = parseTime(timeStr);
    if (positionMs === null) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription('❌ Invalid time format. Use `1:30` (minutes:seconds) or `90` (seconds).')],
        flags: 64
      });
    }

    if (positionMs > durationMs) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription(`❌ Position exceeds track duration (${formatMs(durationMs)}).`)],
        flags: 64
      });
    }

    try {
      await player.seek(positionMs);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_OK).setDescription(`⏩ Seeked to **${formatMs(positionMs)}** / ${formatMs(durationMs)}`)],
        flags: 64
      });
    } catch {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR_ERR).setDescription('❌ Failed to seek.')],
        flags: 64
      });
    }
  }
};

function parseTime(str) {
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;

  let seconds = 0;
  if (parts.length === 1) seconds = parts[0];
  else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
  else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else return null;

  return seconds >= 0 ? seconds * 1000 : null;
}

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
