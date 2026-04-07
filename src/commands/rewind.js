import { SlashCommandBuilder } from '../lib/discord.js';
import { getCurrentQueueItem } from '../services/queue.js';
import { getGuildSettings } from '../services/settingsStore.js';
import { getLavalinkPlayer } from '../services/voice.js';
import { errEmbed, mutedEmbed, okEmbed } from '../utils/embed.js';
import { getPlaybackControlDecision, getPlaybackControlError } from '../utils/playbackPermissions.js';

const DEFAULT_REWIND_SECONDS = 15;

export const rewindCommand = {
  data: new SlashCommandBuilder()
    .setName('rewind')
    .setDescription('Jump backward within the current music track')
    .addIntegerOption((option) =>
      option
        .setName('seconds')
        .setDescription(`How many seconds to rewind (default ${DEFAULT_REWIND_SECONDS})`)
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
          embeds: [mutedEmbed('Only music tracks can be rewound right now.')],
          flags: 64
        });
      }

      if (current?.kind === 'music') {
        return interaction.reply({
          embeds: [mutedEmbed('This track does not support rewinding.')],
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
        embeds: [mutedEmbed('This track does not support rewinding.')],
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

    const rewindSeconds = interaction.options.getInteger('seconds') ?? DEFAULT_REWIND_SECONDS;
    const currentPositionMs = Math.max(0, Number(player.position ?? 0));
    const targetPositionMs = Math.max(0, currentPositionMs - (rewindSeconds * 1000));

    if (targetPositionMs === currentPositionMs) {
      return interaction.reply({
        embeds: [mutedEmbed('This track is already at the beginning.')],
        flags: 64
      });
    }

    const title = player.queue.current?.info?.title ?? current?.title ?? 'current track';

    try {
      await player.seek(targetPositionMs);
      return interaction.reply({
        embeds: [okEmbed(`⏪ Rewound **${title}** to **${formatMs(targetPositionMs)}** / ${formatMs(durationMs)}.`)],
        flags: 64
      });
    } catch {
      return interaction.reply({
        embeds: [errEmbed('❌ Failed to rewind the current track.')],
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
