import { ChannelType, SlashCommandBuilder } from '../lib/discord.js';
import { enqueueMusicRequest } from '../services/queue.js';
import {
  getFavoriteAtPosition,
  getFavorites,
  removeFavoriteAtPosition
} from '../services/musicCatalog.js';
import { getGuildSettings, getVoiceSessionOptions } from '../services/settingsStore.js';
import { getSpeakerAccessDecision, getSpeakerAccessError } from '../utils/accessControl.js';
import { createBrandEmbed } from '../utils/brand.js';
import { errEmbed, mutedEmbed, okEmbed } from '../utils/embed.js';
import { resolveInteractionGuild } from '../utils/guildContext.js';
import { createInteractionMusicNotifications } from '../utils/musicNotifications.js';
import { hasConfiguredAdminAccess } from '../utils/permissions.js';
import { replyWithEmbedFallback } from '../utils/replies.js';
import { resolveMemberVoiceChannel } from '../utils/voiceState.js';
import { musicResolver } from '../services/musicResolver.js';

function buildFavoriteLine(favorite, index) {
  const link = favorite.canonicalUrl ?? favorite.playbackUrl;
  const title = link ? `[${favorite.title}](${link})` : favorite.title;
  return `${index}. **${title}**${favorite.artist ? ` • ${favorite.artist}` : ''}`;
}

function buildReplayQuery(favorite) {
  return favorite.requestQuery
    ?? favorite.canonicalUrl
    ?? favorite.spotifyUri
    ?? favorite.playbackUrl
    ?? [favorite.title, favorite.artist].filter(Boolean).join(' ').trim();
}

export const favoritesCommand = {
  data: new SlashCommandBuilder()
    .setName('favorites')
    .setDescription('List, replay, and manage your saved favorite songs')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Show your saved favorite songs')
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('How many favorites to show')
            .setMinValue(1)
            .setMaxValue(20)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('play')
        .setDescription('Queue one of your saved favorites by position')
        .addIntegerOption((option) =>
          option
            .setName('position')
            .setDescription('Favorite number from `/favorites list`')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Optional voice channel to play in if auto-detection fails.')
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('next')
        .setDescription('Insert one of your saved favorites so it plays next')
        .addIntegerOption((option) =>
          option
            .setName('position')
            .setDescription('Favorite number from `/favorites list`')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Optional voice channel to play in if auto-detection fails.')
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove a saved favorite by position')
        .addIntegerOption((option) =>
          option
            .setName('position')
            .setDescription('Favorite number from `/favorites list`')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list') {
      const favorites = getFavorites(interaction.guildId, interaction.user.id);
      if (favorites.length === 0) {
        return interaction.reply({
          embeds: [mutedEmbed('You have no saved favorites yet. Use `/favorite add` while a song is playing.')],
          flags: 64
        });
      }

      const limit = interaction.options.getInteger('limit') ?? 10;
      const shown = favorites.slice(0, limit);
      const embed = createBrandEmbed({
        title: 'Your Favorites',
        description: shown.map((favorite, index) => buildFavoriteLine(favorite, index + 1)).join('\n'),
        tone: 'support'
      });

      if (favorites.length > shown.length) {
        embed.setFooter({
          text: `Showing ${shown.length} of ${favorites.length} favorites • Harmonia • Free Discord TTS`
        });
      }

      return replyWithEmbedFallback(interaction, embed, { flags: 64 });
    }

    if (subcommand === 'remove') {
      const position = interaction.options.getInteger('position', true);
      const removed = removeFavoriteAtPosition(interaction.guildId, interaction.user.id, position);

      return interaction.reply({
        embeds: [removed
          ? okEmbed(`🗑 Removed favorite **${removed.title}** from slot **${position}**.`)
          : mutedEmbed(`There is no saved favorite at position **${position}**.`)],
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    const position = interaction.options.getInteger('position', true);
    const favorite = getFavoriteAtPosition(interaction.guildId, interaction.user.id, position);
    if (!favorite) {
      return interaction.editReply({
        embeds: [mutedEmbed(`There is no saved favorite at position **${position}**.`)]
      });
    }

    const selectedChannel = interaction.options.getChannel('channel');
    const voiceChannel = selectedChannel ?? await resolveMemberVoiceChannel(interaction);
    if (!voiceChannel) {
      return interaction.editReply({
        embeds: [errEmbed('❌ Join a voice channel first, or use the optional `channel` argument.')]
      });
    }

    const guild = await resolveInteractionGuild(interaction);
    if (!guild) {
      return interaction.editReply({
        embeds: [errEmbed('❌ Could not resolve this server. Please try again.')]
      });
    }

    const settings = await getGuildSettings(interaction.guildId);
    const voiceSession = getVoiceSessionOptions(settings);
    const accessDecision = getSpeakerAccessDecision(
      interaction.member,
      interaction.user.id,
      settings,
      { bypass: hasConfiguredAdminAccess(interaction.member, settings) }
    );
    if (!accessDecision.allowed) {
      return interaction.editReply({
        embeds: [errEmbed(getSpeakerAccessError(accessDecision)?.replace('TTS', 'music playback')
          ?? '❌ You are not allowed to use music playback in this server.')]
      });
    }

    try {
      const placement = subcommand === 'next' ? 'next' : 'end';
      const resolved = await musicResolver.resolve(buildReplayQuery(favorite), {
        guildId: guild.id,
        requesterId: interaction.user.id,
        explicitTitle: favorite.title
      });

      const queueResult = await enqueueMusicRequest({
        guild,
        voiceChannelId: voiceChannel.id,
        textChannel: interaction.channel,
        requesterId: interaction.user.id,
        title: resolved.title,
        artist: resolved.artist,
        durationMs: resolved.durationMs,
        sourceUrl: resolved.playbackInput,
        sourceType: resolved.sourceType,
        thumbnailUrl: resolved.metadata?.thumbnailUrl,
        metadata: resolved.metadata,
        lavalinkTrack: resolved.metadata?.lavalinkTrack ?? null,
        ...voiceSession,
        source: 'music',
        placement,
        notifications: createInteractionMusicNotifications(interaction)
      });

      return interaction.editReply({
        embeds: [okEmbed(
          queueResult.position === 1
            ? `🎵 Queued favorite **${resolved.title}**. Starting now.`
            : placement === 'next'
              ? `🎵 Inserted favorite **${resolved.title}** to play next.`
              : `🎵 Queued favorite **${resolved.title}** at position **${queueResult.position}**.`
        )]
      });
    } catch (error) {
      return interaction.editReply({
        embeds: [errEmbed(`❌ ${error instanceof Error ? error.message : 'Unable to queue this favorite.'}`)]
      });
    }
  }
};
