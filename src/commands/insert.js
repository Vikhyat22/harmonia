import { ChannelType, SlashCommandBuilder } from '../lib/discord.js';
import { enqueueMusicRequest, enqueueMusicRequests } from '../services/queue.js';
import { getGuildSettings, getVoiceSessionOptions } from '../services/settingsStore.js';
import { getSpeakerAccessDecision, getSpeakerAccessError } from '../utils/accessControl.js';
import { resolveInteractionGuild } from '../utils/guildContext.js';
import { createInteractionMusicNotifications } from '../utils/musicNotifications.js';
import { hasConfiguredAdminAccess } from '../utils/permissions.js';
import { resolveMemberVoiceChannel } from '../utils/voiceState.js';
import { musicResolver } from '../services/musicResolver.js';
import { okEmbed, errEmbed } from '../utils/embed.js';
import { isPlaylistMediaUrl } from '../utils/mediaUrls.js';

export const insertCommand = {
  data: new SlashCommandBuilder()
    .setName('insert')
    .setDescription('Insert a song or playlist so it plays next')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Song name, platform link, or direct audio/stream URL')
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Optional display title for the inserted track')
        .setRequired(false)
        .setMaxLength(100)
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Optional voice channel to play in if auto-detection fails.')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });

    const query = interaction.options.getString('query', true);
    const explicitTitle = interaction.options.getString('title');
    const selectedChannel = interaction.options.getChannel('channel');
    const voiceChannel = selectedChannel ?? await resolveMemberVoiceChannel(interaction);

    if (!voiceChannel) {
      return interaction.editReply({ embeds: [errEmbed('❌ Join a voice channel first, or use the optional `channel` argument.')] });
    }

    const guild = await resolveInteractionGuild(interaction);
    if (!guild) {
      return interaction.editReply({ embeds: [errEmbed('❌ Could not resolve this server. Please try again.')] });
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
      if (await isPlaylistMediaUrl(query)) {
        const tracks = await musicResolver.resolvePlaylist(query, {
          guildId: guild.id,
          requesterId: interaction.user.id
        });

        if (!tracks || tracks.length === 0) {
          return interaction.editReply({ embeds: [errEmbed('❌ Could not load any tracks from that playlist.')] });
        }

        const queueResult = await enqueueMusicRequests({
          guild,
          voiceChannelId: voiceChannel.id,
          textChannel: interaction.channel,
          requesterId: interaction.user.id,
          ...voiceSession,
          source: 'music',
          placement: 'next',
          notifications: createInteractionMusicNotifications(interaction),
          tracks: tracks.map((track) => ({
            title: track.title,
            artist: track.artist,
            durationMs: track.durationMs,
            sourceUrl: track.playbackInput,
            sourceType: track.sourceType,
            thumbnailUrl: track.metadata?.thumbnailUrl,
            metadata: track.metadata,
            lavalinkTrack: track.metadata?.lavalinkTrack ?? null
          }))
        });

        return interaction.editReply({
          embeds: [okEmbed(queueResult.firstPosition === 1
            ? `🎵 Inserted **${tracks.length}** playlist track(s). Starting now.`
            : `🎵 Inserted **${tracks.length}** playlist track(s) to play next.`)]
        });
      }

      const resolved = await musicResolver.resolve(query, {
        guildId: guild.id,
        requesterId: interaction.user.id,
        explicitTitle
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
        placement: 'next',
        notifications: createInteractionMusicNotifications(interaction)
      });

      return interaction.editReply({
        embeds: [okEmbed(queueResult.position === 1
          ? `🎵 Inserted **${resolved.title}**. Starting now.`
          : `🎵 Inserted **${resolved.title}** to play next.`)]
      });
    } catch (error) {
      return interaction.editReply({
        embeds: [errEmbed(`❌ ${error instanceof Error ? error.message : 'Unable to insert this music request.'}`)]
      });
    }
  }
};
