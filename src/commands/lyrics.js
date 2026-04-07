import { SlashCommandBuilder } from '../lib/discord.js';
import { createBrandEmbed } from '../utils/brand.js';
import { mutedEmbed } from '../utils/embed.js';
import { getCurrentQueueItem } from '../services/queue.js';
import { getLavalinkPlayer } from '../services/voice.js';
import { chunkLyricsForEmbeds, fetchLyrics } from '../services/lyrics.js';

function getCurrentMusicContext(guildId) {
  const current = getCurrentQueueItem(guildId);
  if (current?.kind === 'music') {
    return {
      title: current.title,
      artist: current.artist ?? null
    };
  }

  const player = getLavalinkPlayer(guildId);
  const track = player?.queue?.current;
  if (!track) {
    return null;
  }

  return {
    title: track.info?.title ?? null,
    artist: track.info?.author ?? null
  };
}

function buildLyricsEmbeds(result) {
  const chunks = chunkLyricsForEmbeds(result.lyrics);
  const totalChunks = Math.min(chunks.length, 4);

  return chunks.slice(0, totalChunks).map((chunk, index) => {
    const embed = createBrandEmbed({
      title: index === 0
        ? `Lyrics • ${result.title}`
        : `Lyrics • ${result.title} (${index + 1}/${totalChunks})`,
      description: chunk,
      tone: 'support'
    });

    if (result.artist) {
      embed.setAuthor({
        name: `Harmonia • ${result.artist}`
      });
    }

    if (chunks.length > totalChunks && index === totalChunks - 1) {
      embed.setFooter({
        text: 'Lyrics truncated for Discord • Harmonia • Free Discord TTS'
      });
    }

    return embed;
  });
}

export const lyricsCommand = {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Show lyrics for the current song or a search query')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Optional song query, e.g. "Tum Hi Ho" or "Arijit Singh - Tum Hi Ho"')
        .setRequired(false)
        .setMaxLength(200)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    const currentTrack = query ? null : getCurrentMusicContext(interaction.guildId);

    if (!query && !currentTrack) {
      return interaction.reply({
        embeds: [mutedEmbed('Nothing is playing right now. Pass a song query to `/lyrics`, or play a track first.')],
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const result = await fetchLyrics({
        title: currentTrack?.title ?? null,
        artist: currentTrack?.artist ?? null,
        query: query ?? null
      });

      if (!result?.lyrics) {
        return interaction.editReply({
          embeds: [mutedEmbed('I could not find lyrics for that track right now.')]
        });
      }

      return interaction.editReply({
        embeds: buildLyricsEmbeds(result)
      });
    } catch (error) {
      return interaction.editReply({
        embeds: [mutedEmbed(`Lyrics lookup failed: ${error instanceof Error ? error.message : 'Unknown error.'}`)]
      });
    }
  }
};
