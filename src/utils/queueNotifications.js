import { EmbedBuilder } from '../lib/discord.js';

async function safeRespond(interaction, payload) {
  try {
    await interaction.editReply(payload);
  } catch (error) {
    console.error('Failed to respond to interaction:', error?.message ?? error);
    try {
      await interaction.followUp({ ...payload, flags: 64 });
    } catch {
      // Final fallback - nothing we can do
    }
  }
}

export function createInteractionQueueNotifications(interaction) {
  return {
    onStart: async ({ languageName, totalChunks }) => {
      await safeRespond(interaction, {
        content: totalChunks > 1
          ? `🎙️ Starting queued speech in ${languageName}. ${totalChunks} chunks to play.`
          : `🎙️ Starting queued speech in ${languageName}.`
      });
    },
    onProgress: async ({ currentChunk, totalChunks, languageName }) => {
      if (totalChunks <= 1) {
        return;
      }

      await safeRespond(interaction, {
        content: `🎙️ Playing chunk ${currentChunk}/${totalChunks} in ${languageName}...`
      });
    },
    onComplete: async ({ languageName, idleDisconnectMs, stayConnected }) => {
      await safeRespond(interaction, {
        content: stayConnected
          ? `✅ Finished speaking in ${languageName}. 24/7 mode is on, so I’ll stay connected until you use /leave or disable /247.`
          : `✅ Finished speaking in ${languageName}. I will stay in the voice channel for ${Math.round(idleDisconnectMs / 1000)} seconds unless you use /leave.`
      });
    },
    onError: async ({ message }) => {
      await safeRespond(interaction, {
        content: `❌ Playback failed: ${message}`
      });
    },
    onStopped: async ({ skipped }) => {
      await safeRespond(interaction, {
        content: skipped ? '⏭️ Your TTS message was skipped.' : '⏹️ Your TTS message was stopped.'
      });
    },
    onCancelled: async ({ message }) => {
      await safeRespond(interaction, {
        content: `❌ ${message}`
      });
    }
  };
}

export function createMusicQueueEmbed(track, position, requesterId) {
  const embed = new EmbedBuilder()
    .setTitle(`🎵 ${track.title}`)
    .setDescription(track.artist ? `by ${track.artist}` : 'Unknown Artist')
    .addFields(
      { name: 'Position', value: String(position), inline: true },
      { name: 'Source', value: track.sourceType || 'direct-url', inline: true }
    )
    .setFooter({ text: `Requested by ${requesterId}` })
    .setTimestamp();
  
  if (track.metadata?.thumbnailUrl) {
    embed.setThumbnail(track.metadata.thumbnailUrl);
  }
  
  if (track.metadata?.autoplay) {
    embed.addFields({ name: 'Autoplay', value: '🔄', inline: true });
  }
  
  return embed;
}
