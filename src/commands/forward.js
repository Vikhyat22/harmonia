import { SlashCommandBuilder } from '../lib/discord.js';
import { getCurrentQueueItem } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { getLavalinkPlayer } from '../services/voice.js';
import { errEmbed, mutedEmbed, okEmbed } from '../utils/embed.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

const DEFAULT_FORWARD_SECONDS = 15;

export const forwardCommand = {
  data: new SlashCommandBuilder()
    .setName('forward')
    .setDescription('Jump forward within the current music track')
    .addIntegerOption((option) =>
      option
        .setName('seconds')
        .setDescription(`How many seconds to skip forward (default ${DEFAULT_FORWARD_SECONDS})`)
        .setMinValue(5)
        .setMaxValue(300)
        .setRequired(false)
    ),

  async execute(interaction) {
    const player = getLavalinkPlayer(interaction.guildId);
    const current = getCurrentQueueItem(interaction.guildId);

    if (!player?.queue?.current) {
      if (current?.kind === 'speech') {
        return interaction.reply({
          embeds: [mutedEmbed('Only music tracks can be forwarded right now.')],
          flags: 64
        });
      }

      if (current?.kind === 'music') {
        return interaction.reply({
          embeds: [mutedEmbed('This track does not support forwarding.')],
          flags: 64
        });
      }

      return interaction.reply({
        embeds: [errEmbed('❌ Nothing is playing right now.')],
        flags: 64
      });
    }

    const durationMs = Number(player.queue.current?.info?.duration ?? 0);
    if (!durationMs) {
      return interaction.reply({
        embeds: [mutedEmbed('This track does not support forwarding.')],
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
        embeds: [errEmbed(getPlaybackControlError(settings, { allowRequester: true }))],
        flags: 64
      });
    }

    const maxSeekPositionMs = Math.max(durationMs - 1000, 0);
    const forwardSeconds = interaction.options.getInteger('seconds') ?? DEFAULT_FORWARD_SECONDS;
    const currentPositionMs = Math.max(0, Number(player.position ?? 0));
    const targetPositionMs = Math.min(maxSeekPositionMs, currentPositionMs + (forwardSeconds * 1000));

    if (targetPositionMs === currentPositionMs) {
      return interaction.reply({
        embeds: [mutedEmbed('This track is already near the end.')],
        flags: 64
      });
    }

    const title = player.queue.current?.info?.title ?? current?.title ?? 'current track';

    try {
      await player.seek(targetPositionMs);
      return interaction.reply({
        embeds: [okEmbed(`⏩ Forwarded **${title}** to **${formatMs(targetPositionMs)}** / ${formatMs(durationMs)}.`)],
        flags: 64
      });
    } catch {
      return interaction.reply({
        embeds: [errEmbed('❌ Failed to forward the current track.')],
        flags: 64
      });
    }
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
