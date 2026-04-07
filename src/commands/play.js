import { ChannelType, EmbedBuilder, SlashCommandBuilder } from '../lib/discord.js';
import { enqueueMusicRequest, enqueueMusicRequests, getQueueSnapshot } from '../services/queue.js';
import { getGuildSettings, getVoiceSessionOptions } from '../services/settingsStore.js';
import { getSpeakerAccessDecision, getSpeakerAccessError } from '../utils/accessControl.js';
import { resolveInteractionGuild } from '../utils/guildContext.js';
import { createInteractionMusicNotifications } from '../utils/musicNotifications.js';
import { hasConfiguredAdminAccess } from '../utils/permissions.js';
import { resolveMemberVoiceChannel } from '../utils/voiceState.js';
import { musicResolver } from '../services/musicResolver.js';
import { okEmbed, errEmbed, mutedEmbed } from '../utils/embed.js';
import { isPlaylistMediaUrl } from '../utils/mediaUrls.js';

/** Returns true for pure playlist URLs (no individual video/track selected). */
async function isPlaylistUrl(query) {
  return isPlaylistMediaUrl(query);
}

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

function sendAddedToQueueEmbed(interaction, resolved, queueResult, guildId) {
  if (!interaction.channel) return;

  const snapshot = getQueueSnapshot(guildId);
  const tracksAhead = snapshot.queued.slice(0, Math.max(0, queueResult.position - 2));
  const waitMs = tracksAhead.reduce((sum, t) => sum + (t.durationMs ?? 0), 0);

  const dur = formatDuration(resolved.durationMs);
  const wait = formatDuration(waitMs);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: 'Added to Queue' })
    .setDescription(`**${resolved.title}**${resolved.artist ? `\nby **${resolved.artist}**` : ''}`)
    .addFields({ name: 'Position', value: `#${queueResult.position}`, inline: true });

  if (dur) embed.addFields({ name: 'Duration', value: dur, inline: true });
  if (wait) embed.addFields({ name: 'Est. wait', value: wait, inline: true });

  embed.setFooter({
    text: `Requested by ${interaction.member?.displayName ?? interaction.user.username}`,
    iconURL: interaction.user.displayAvatarURL()
  });

  if (resolved.metadata?.thumbnailUrl) {
    embed.setThumbnail(resolved.metadata.thumbnailUrl);
  }

  interaction.channel.send({ embeds: [embed] }).catch(() => {});
}

export const playCommand = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or direct audio source in your voice channel')
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
        .setDescription('Optional display title for the queued track')
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
      if (await isPlaylistUrl(query)) {
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
          notifications: createInteractionMusicNotifications(interaction),
          tracks: tracks.map((track) => ({
            title: track.title,
            artist: track.artist,
            durationMs: track.durationMs,
            sourceUrl: track.playbackInput,
            sourceType: track.sourceType,
            thumbnailUrl: track.metadata?.thumbnailUrl,
            metadata: track.metadata,
            lavalinkTrack: track.metadata?.lavalinkTrack ?? null,
          }))
        });

        const startsNow = queueResult.firstPosition === 1;
        return interaction.editReply({
          embeds: [okEmbed(
            startsNow
              ? `🎵 Queued **${tracks.length}** tracks from playlist. Starting now.`
              : `🎵 Queued **${tracks.length}** tracks from playlist.`
          )]
        });
      }

      // Single track
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
        notifications: createInteractionMusicNotifications(interaction)
      });

      if (queueResult.position > 1) {
        sendAddedToQueueEmbed(interaction, resolved, queueResult, guild.id);
      }

      return interaction.editReply({
        embeds: [okEmbed(queueResult.position === 1
          ? `🎵 **${resolved.title}** · Starting now.`
          : `🎵 **${resolved.title}** · Position **${queueResult.position}**.`)]
      });
    } catch (error) {
      return interaction.editReply({
        embeds: [errEmbed(`❌ ${error instanceof Error ? error.message : 'Unable to queue this music request.'}`)]
      });
    }
  }
};
