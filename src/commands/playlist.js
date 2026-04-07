import { ChannelType, SlashCommandBuilder } from '../lib/discord.js';
import { enqueueMusicRequests } from '../services/queue.js';
import { getCurrentQueueItem, getQueuedMusicItems } from '../services/queue.js';
import {
  appendTracksToPlaylist,
  deletePlaylist,
  getPlaylist,
  getPlaylists,
  removePlaylistTrackAtPosition,
  renamePlaylist,
  savePlaylist
} from '../services/playlistStore.js';
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

function buildReplayQuery(track) {
  return track.requestQuery
    ?? track.canonicalUrl
    ?? track.spotifyUri
    ?? track.playbackUrl
    ?? [track.title, track.artist].filter(Boolean).join(' ').trim();
}

function buildPlaylistLine(playlist, index) {
  return `${index}. **${playlist.name}** • ${playlist.trackCount} track${playlist.trackCount !== 1 ? 's' : ''}`;
}

function buildPlaylistTrackLine(track, index) {
  const link = track.canonicalUrl ?? track.playbackUrl;
  const title = link ? `[${track.title}](${link})` : track.title;
  return `${index}. **${title}**${track.artist ? ` • ${track.artist}` : ''}`;
}

export const playlistCommand = {
  data: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Save, manage, replay, and delete your named playlists')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('save')
        .setDescription('Save the current music queue as a named playlist')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Playlist name')
            .setRequired(true)
            .setMaxLength(50)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Add the current song to a named playlist, creating it if needed')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Playlist name')
            .setRequired(true)
            .setMaxLength(50)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('append-queue')
        .setDescription('Append the current music queue to a named playlist, creating it if needed')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Playlist name')
            .setRequired(true)
            .setMaxLength(50)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Show your saved playlists')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('Show the saved tracks inside one of your playlists')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Playlist name')
            .setRequired(true)
            .setMaxLength(50)
        )
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('How many tracks to show')
            .setMinValue(1)
            .setMaxValue(25)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('play')
        .setDescription('Queue one of your saved playlists by name')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Playlist name')
            .setRequired(true)
            .setMaxLength(50)
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
        .setDescription('Insert one of your saved playlists so it plays next')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Playlist name')
            .setRequired(true)
            .setMaxLength(50)
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
        .setName('rename')
        .setDescription('Rename one of your saved playlists')
        .addStringOption((option) =>
          option
            .setName('from')
            .setDescription('Current playlist name')
            .setRequired(true)
            .setMaxLength(50)
        )
        .addStringOption((option) =>
          option
            .setName('to')
            .setDescription('New playlist name')
            .setRequired(true)
            .setMaxLength(50)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove-track')
        .setDescription('Remove a saved track from one of your playlists')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Playlist name')
            .setRequired(true)
            .setMaxLength(50)
        )
        .addIntegerOption((option) =>
          option
            .setName('position')
            .setDescription('Track number from that playlist')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Delete one of your saved playlists by name')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Playlist name')
            .setRequired(true)
            .setMaxLength(50)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'save') {
      const name = interaction.options.getString('name', true);
      const tracks = getQueuedMusicItems(interaction.guildId, { includeCurrent: true });

      if (tracks.length === 0) {
        return interaction.reply({
          embeds: [mutedEmbed('There are no music tracks in the current queue to save.')],
          flags: 64
        });
      }

      const playlist = savePlaylist(interaction.guildId, interaction.user.id, name, tracks);
      const truncated = tracks.length > playlist.trackCount;
      const detail = truncated
        ? ` Saved the first **${playlist.trackCount}** tracks due to the playlist limit.`
        : '';

      return interaction.reply({
        embeds: [okEmbed(`💾 Saved **${playlist.name}** with **${playlist.trackCount}** track(s).${detail}`)],
        flags: 64
      });
    }

    if (subcommand === 'add') {
      const name = interaction.options.getString('name', true);
      const current = getCurrentQueueItem(interaction.guildId);

      if (!current || current.kind !== 'music') {
        return interaction.reply({
          embeds: [mutedEmbed('Play a music track first, then use `/playlist add` to save it.')],
          flags: 64
        });
      }

      const result = appendTracksToPlaylist(interaction.guildId, interaction.user.id, name, [current], {
        createIfMissing: true
      });
      const truncationDetail = result.truncated
        ? ' The playlist hit the saved-track limit, so not every new track could be added.'
        : '';

      return interaction.reply({
        embeds: [okEmbed(result.created
          ? `💾 Created **${result.name}** and added **${current.title}**.${truncationDetail}`
          : `➕ Added **${current.title}** to **${result.name}**.${truncationDetail}`)],
        flags: 64
      });
    }

    if (subcommand === 'append-queue') {
      const name = interaction.options.getString('name', true);
      const tracks = getQueuedMusicItems(interaction.guildId, { includeCurrent: true });

      if (tracks.length === 0) {
        return interaction.reply({
          embeds: [mutedEmbed('There are no music tracks in the current queue to append right now.')],
          flags: 64
        });
      }

      const result = appendTracksToPlaylist(interaction.guildId, interaction.user.id, name, tracks, {
        createIfMissing: true
      });
      const truncationDetail = result.truncated
        ? ' The playlist hit the saved-track limit, so not every queued track could be added.'
        : '';

      return interaction.reply({
        embeds: [okEmbed(result.created
          ? `💾 Created **${result.name}** and appended **${result.addedCount}** queued track(s).${truncationDetail}`
          : `➕ Appended **${result.addedCount}** queued track(s) to **${result.name}**.${truncationDetail}`)],
        flags: 64
      });
    }

    if (subcommand === 'list') {
      const playlists = getPlaylists(interaction.guildId, interaction.user.id);
      if (playlists.length === 0) {
        return interaction.reply({
          embeds: [mutedEmbed('You have no saved playlists yet. Use `/playlist save` while music is queued.')],
          flags: 64
        });
      }

      const embed = createBrandEmbed({
        title: 'Your Playlists',
        description: playlists.slice(0, 15).map((playlist, index) => buildPlaylistLine(playlist, index + 1)).join('\n'),
        tone: 'support'
      });

      if (playlists.length > 15) {
        embed.setFooter({
          text: `Showing 15 of ${playlists.length} playlists • Harmonia • Free Discord TTS`
        });
      }

      return replyWithEmbedFallback(interaction, embed, { flags: 64 });
    }

    if (subcommand === 'view') {
      const name = interaction.options.getString('name', true);
      const playlist = getPlaylist(interaction.guildId, interaction.user.id, name);
      if (!playlist) {
        return interaction.reply({
          embeds: [mutedEmbed(`I couldn’t find a playlist named **${name.trim()}**.`)],
          flags: 64
        });
      }

      const limit = interaction.options.getInteger('limit') ?? 10;
      const shownTracks = playlist.tracks.slice(0, limit);
      const embed = createBrandEmbed({
        title: playlist.name,
        description: shownTracks.map((track, index) => buildPlaylistTrackLine(track, index + 1)).join('\n'),
        tone: 'support'
      }).addFields({
        name: 'Tracks',
        value: `${playlist.trackCount}`
      });

      if (playlist.tracks.length > shownTracks.length) {
        embed.setFooter({
          text: `Showing ${shownTracks.length} of ${playlist.tracks.length} tracks • Harmonia • Free Discord TTS`
        });
      }

      return replyWithEmbedFallback(interaction, embed, { flags: 64 });
    }

    if (subcommand === 'rename') {
      const fromName = interaction.options.getString('from', true);
      const toName = interaction.options.getString('to', true);
      const result = renamePlaylist(interaction.guildId, interaction.user.id, fromName, toName);

      let embed;
      if (!result.renamed) {
        embed = result.reason === 'target-exists'
          ? mutedEmbed(`You already have a playlist named **${toName.trim()}**.`)
          : mutedEmbed(`I couldn’t find a playlist named **${fromName.trim()}**.`);
      } else {
        embed = okEmbed(`✏️ Renamed **${result.fromName}** to **${result.toName}**.`);
      }

      return interaction.reply({
        embeds: [embed],
        flags: 64
      });
    }

    if (subcommand === 'remove-track') {
      const name = interaction.options.getString('name', true);
      const position = interaction.options.getInteger('position', true);
      const result = removePlaylistTrackAtPosition(interaction.guildId, interaction.user.id, name, position);

      let embed;
      if (!result.removed) {
        embed = result.reason === 'missing'
          ? mutedEmbed(`I couldn’t find a playlist named **${name.trim()}**.`)
          : mutedEmbed(`There is no saved track at position **${position}** in **${name.trim()}**.`);
      } else if (result.deletedPlaylist) {
        embed = okEmbed(`🗑 Removed **${result.track.title}** and deleted **${result.playlistName}** because it was the last saved track.`);
      } else {
        embed = okEmbed(`🗑 Removed **${result.track.title}** from **${result.playlistName}**.`);;
      }

      return interaction.reply({
        embeds: [embed],
        flags: 64
      });
    }

    if (subcommand === 'delete') {
      const name = interaction.options.getString('name', true);
      const removed = deletePlaylist(interaction.guildId, interaction.user.id, name);

      return interaction.reply({
        embeds: [removed
          ? okEmbed(`🗑 Deleted playlist **${name.trim()}**.`)
          : mutedEmbed(`I couldn’t find a playlist named **${name.trim()}**.`)],
        flags: 64
      });
    }

    await interaction.deferReply({ flags: 64 });

    const name = interaction.options.getString('name', true);
    const playlist = getPlaylist(interaction.guildId, interaction.user.id, name);
    if (!playlist) {
      return interaction.editReply({
        embeds: [mutedEmbed(`I couldn’t find a playlist named **${name.trim()}**.`)]
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

    const resolvedTracks = [];
    let skipped = 0;

    for (const track of playlist.tracks) {
      try {
        const resolved = await musicResolver.resolve(buildReplayQuery(track), {
          guildId: guild.id,
          requesterId: interaction.user.id,
          explicitTitle: track.title
        });

        resolvedTracks.push({
          title: resolved.title,
          artist: resolved.artist,
          durationMs: resolved.durationMs,
          sourceUrl: resolved.playbackInput,
          sourceType: resolved.sourceType,
          thumbnailUrl: resolved.metadata?.thumbnailUrl,
          metadata: resolved.metadata,
          lavalinkTrack: resolved.metadata?.lavalinkTrack ?? null
        });
      } catch {
        skipped += 1;
      }
    }

    if (resolvedTracks.length === 0) {
      return interaction.editReply({
        embeds: [mutedEmbed(`I couldn’t resolve any playable tracks from **${playlist.name}** right now.`)]
      });
    }

    const placement = subcommand === 'next' ? 'next' : 'end';
    const queueResult = await enqueueMusicRequests({
      guild,
      voiceChannelId: voiceChannel.id,
      textChannel: interaction.channel,
      requesterId: interaction.user.id,
      ...voiceSession,
      source: 'music',
      placement,
      notifications: createInteractionMusicNotifications(interaction),
      tracks: resolvedTracks
    });

    const startsNow = queueResult.firstPosition === 1;
    const skipDetail = skipped > 0
      ? ` Skipped **${skipped}** track(s) that could not be resolved.`
      : '';

    return interaction.editReply({
      embeds: [okEmbed(
        startsNow
          ? `🎵 Queued playlist **${playlist.name}** with **${resolvedTracks.length}** track(s). Starting now.${skipDetail}`
          : placement === 'next'
            ? `🎵 Inserted playlist **${playlist.name}** with **${resolvedTracks.length}** track(s) to play next.${skipDetail}`
          : `🎵 Queued playlist **${playlist.name}** with **${resolvedTracks.length}** track(s).${skipDetail}`
      )]
    });
  }
};
