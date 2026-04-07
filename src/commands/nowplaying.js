import { SlashCommandBuilder, EmbedBuilder } from '../lib/discord.js';
import { getLavalinkPlayer } from '../services/voice.js';
import { getQueueSnapshot } from '../services/queue.js';

const COLOR_PLAYING = 0x56c7a7;
const COLOR_NONE    = 0x4f545c;

export const nowPlayingCommand = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show what Harmonia is currently playing'),

  async execute(interaction) {
    // Check Lavalink music first
    const player = getLavalinkPlayer(interaction.guildId);
    if (player && player.queue.current) {
      const track = player.queue.current;
      const title = track.info?.title ?? 'Unknown';
      const author = track.info?.author ?? '';
      const uri = track.info?.uri ?? null;
      const posMs = player.position ?? 0;
      const durMs = track.info?.duration ?? 0;

      const loopIcon = player.repeatMode === 'track' ? ' 🔂' : player.repeatMode === 'queue' ? ' 🔁' : '';
      const statusIcon = player.paused ? '⏸' : '▶';

      const embed = new EmbedBuilder()
        .setColor(COLOR_PLAYING)
        .setDescription(`${statusIcon} **${uri ? `[${title}](${uri})` : title}**${loopIcon}\nby ${author}`);

      if (durMs > 0) {
        embed.addFields({
          name: '\u200b',
          value: `\`${formatMs(posMs)}\` ${buildBar(posMs, durMs)} \`${formatMs(durMs)}\``
        });
      }

      const requester = track.requester;
      if (requester?.id) {
        embed.setFooter({ text: `Requested by ${requester.username ?? requester.id}` });
      }

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    // Fall back to TTS queue snapshot
    const snapshot = getQueueSnapshot(interaction.guildId);
    if (snapshot.current) {
      const current = snapshot.current;
      const embed = new EmbedBuilder()
        .setColor(COLOR_PLAYING)
        .setDescription(`▶ **${current.label}**`)
        .addFields(
          { name: 'Type', value: current.kind === 'music' ? 'Music' : 'TTS', inline: true },
          { name: 'Requested by', value: `<@${current.requesterId}>`, inline: true },
          { name: 'Status', value: current.paused ? 'Paused' : 'Playing', inline: true }
        );
      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(COLOR_NONE).setDescription('Nothing is currently playing.')],
      flags: 64
    });
  }
};

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function buildBar(posMs, durMs, width = 14) {
  const ratio = Math.min(posMs / durMs, 1);
  const filled = Math.round(ratio * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}
