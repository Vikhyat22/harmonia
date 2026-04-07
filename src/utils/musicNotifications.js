import { EmbedBuilder } from '../lib/discord.js';
import { syncMusicRequestController } from './musicRequestChannel.js';
import {
  buildMusicControlRow,
  clearActiveMusicControlMessage,
  setActiveMusicControlMessage
} from './musicControls.js';

const COLOR_PLAYING = 0x56c7a7;  // brand green — now playing
const COLOR_DONE    = 0x4f545c;  // grey — finished / stopped
const COLOR_ERROR   = 0xe37d6f;  // red — error

function formatDuration(ms) {
  if (!ms || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

function playingEmbed(title, playbackUrl, {
  artist, thumbnailUrl, durationMs, requesterId, isAutoplay, mirrored, requestedUrl
} = {}) {
  const linkedTitle = playbackUrl ? `[${title}](${playbackUrl})` : title;

  const lines = [`▶ **${linkedTitle}**`];
  if (artist) lines.push(`by **${artist}**`);

  const meta = [];
  if (requesterId) meta.push(`<@${requesterId}>`);
  const dur = formatDuration(durationMs);
  if (dur) meta.push(dur);
  if (isAutoplay) meta.push('🔄 Autoplay');
  if (mirrored && requestedUrl && requestedUrl !== playbackUrl) {
    meta.push(`via [Spotify](${requestedUrl})`);
  }
  if (meta.length > 0) lines.push(meta.join(' · '));

  const embed = new EmbedBuilder()
    .setColor(COLOR_PLAYING)
    .setDescription(lines.join('\n'));

  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

  return embed;
}

function editedEmbed(description, color = COLOR_DONE) {
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(description);
}

export function createInteractionMusicNotifications(interaction) {
  // Shared mutable reference to the public "now playing" message.
  let nowPlayingMsg = null;
  const syncController = () => syncMusicRequestController(interaction.guild, {
    channel: interaction.channel
  }).catch(() => {});

  async function sendPublic(embeds, components = []) {
    if (!interaction.channel) return null;
    try {
      return await interaction.channel.send({ embeds, components });
    } catch {
      return null;
    }
  }

  async function editPublic(embeds, components) {
    if (!nowPlayingMsg) return;
    const update = { embeds };
    if (components !== undefined) update.components = components;
    try {
      await nowPlayingMsg.edit(update);
    } catch {
      // Message may have been deleted — ignore.
    }
  }

  return {
    onStart: async ({ title, playbackUrl, requestedUrl, mirrored, artist, thumbnailUrl, durationMs, requesterId, isAutoplay }) => {
      try {
        await interaction.editReply({ content: `🎵 Starting **${title}**…` });
      } catch { /* ignore */ }

      const embed = playingEmbed(title, playbackUrl, { artist, thumbnailUrl, durationMs, requesterId, isAutoplay, mirrored, requestedUrl });

      if (nowPlayingMsg) {
        await editPublic([embed], [buildMusicControlRow(false)]);
        setActiveMusicControlMessage(interaction.guildId, nowPlayingMsg.id);
        await syncController();
        return;
      }

      nowPlayingMsg = await sendPublic([embed], [buildMusicControlRow(false)]);
      setActiveMusicControlMessage(interaction.guildId, nowPlayingMsg?.id);
      await syncController();
    },

    onComplete: async ({ title }) => {
      await editPublic([editedEmbed(`✅ **${title}**`, COLOR_DONE)], []);
      clearActiveMusicControlMessage(interaction.guildId, nowPlayingMsg?.id);
      await syncController();
    },

    onStopped: async ({ skipped, title }) => {
      if (skipped) {
        const user = interaction.user;
        const mention = user ? `<@${user.id}>` : 'Someone';
        await editPublic([
          editedEmbed(`⏭ **${title}** was skipped by ${mention}`, COLOR_DONE)
        ], []);
        clearActiveMusicControlMessage(interaction.guildId, nowPlayingMsg?.id);
        await syncController();
      } else {
        await editPublic([editedEmbed(`⏹ Stopped **${title ?? 'playback'}**`, COLOR_DONE)], []);
        clearActiveMusicControlMessage(interaction.guildId, nowPlayingMsg?.id);
        await syncController();
      }
    },

    onError: async ({ message }) => {
      await editPublic([editedEmbed(`❌ ${message}`, COLOR_ERROR)], []);
      clearActiveMusicControlMessage(interaction.guildId, nowPlayingMsg?.id);
      await syncController();
      // Also let the requester know via their ephemeral reply.
      try {
        await interaction.editReply({ content: `❌ Music playback failed: ${message}` });
      } catch { /* ignore */ }
    },

    onRetry: async ({ failedTitle, title, message }) => {
      await editPublic([
        editedEmbed(`⚠️ **${failedTitle}** failed (${message}). Trying **${title}**…`, COLOR_DONE)
      ]);
      await syncController();
      try {
        await interaction.editReply({
          content: `⚠️ Couldn't play **${failedTitle}**. Trying **${title}**…`
        });
      } catch { /* ignore */ }
    },

    onCancelled: async ({ message }) => {
      await syncController();
      try {
        await interaction.followUp({ content: `❌ ${message}`, flags: 64 });
      } catch { /* ignore */ }
    }
  };
}
