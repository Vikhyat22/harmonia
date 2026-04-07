import { enqueueMusicRequest, enqueueMusicRequests, getQueueSnapshot } from '../services/queue.js';
import { musicResolver } from '../services/musicResolver.js';
import { getGuildSettings, getVoiceSessionOptions, updateGuildSettings } from '../services/settingsStore.js';
import { createBrandEmbed } from './brand.js';
import { getSpeakerAccessDecision, getSpeakerAccessError } from './accessControl.js';
import { isPlaylistMediaUrl } from './mediaUrls.js';
import { hasConfiguredAdminAccess } from './permissions.js';
import { buildMusicControlRow } from './musicControls.js';

function formatDuration(ms) {
  if (!ms || ms <= 0) return null;
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatQueueItem(item) {
  if (!item) {
    return 'Nothing playing right now.';
  }

  if (item.kind === 'music') {
    const parts = [`**${item.label}**`];
    if (item.artist) parts.push(`by ${item.artist}`);
    const duration = formatDuration(item.durationMs);
    if (duration) parts.push(duration);
    if (item.paused) parts.push('⏸ paused');
    return parts.join(' · ');
  }

  const chunks = item.totalChunks ? `${item.totalChunks} chunk(s)` : 'speech';
  return `🗣️ **${item.label}** · ${chunks}${item.paused ? ' · ⏸ paused' : ''}`;
}

function formatQueuedItem(item, index) {
  if (item.kind === 'music') {
    const parts = [`${index + 1}. **${item.label}**`];
    if (item.artist) parts.push(item.artist);
    const duration = formatDuration(item.durationMs);
    if (duration) parts.push(duration);
    return parts.join(' · ');
  }

  return `${index + 1}. 🗣️ **${item.label}** · ${item.totalChunks ?? 0} chunk(s)`;
}

function buildControllerDescription(channelId) {
  return [
    channelId
      ? `Type a song name, music URL, playlist link, or direct stream in <#${channelId}>.`
      : 'Configure a text channel with `/musicchannel set` to turn normal messages into song requests.',
    'Join a voice channel first and Harmonia will queue the request automatically.'
  ].join('\n');
}

export function buildMusicRequestControllerEmbed(guildId, settings) {
  const snapshot = getQueueSnapshot(guildId);
  const embed = createBrandEmbed({
    title: 'Music Request Channel',
    description: buildControllerDescription(settings?.musicRequestChannelId),
    tone: snapshot.current ? 'support' : 'warm'
  }).addFields({
    name: 'Now Playing',
    value: formatQueueItem(snapshot.current)
  });

  if (snapshot.queued.length > 0) {
    const lines = snapshot.queued.slice(0, 5).map((item, index) => formatQueuedItem(item, index));
    if (snapshot.queued.length > 5) {
      lines.push(`…and ${snapshot.queued.length - 5} more`);
    }
    embed.addFields({
      name: `Up Next (${snapshot.queued.length})`,
      value: lines.join('\n')
    });
  } else {
    embed.addFields({
      name: 'Up Next',
      value: 'Nothing queued.'
    });
  }

  embed.setFooter({
    text: 'Use the buttons below to pause, skip, or stop playback.'
  });

  return embed;
}

async function resolveRequestChannel(guild, settings, providedChannel = null) {
  if (!guild || !settings?.musicRequestChannelId) {
    return null;
  }

  if (providedChannel?.id === settings.musicRequestChannelId) {
    return providedChannel;
  }

  const cached = guild.channels?.cache?.get(settings.musicRequestChannelId);
  if (cached?.isTextBased?.()) {
    return cached;
  }

  const fetched = await guild.channels?.fetch?.(settings.musicRequestChannelId).catch(() => null);
  return fetched?.isTextBased?.() ? fetched : null;
}

async function fetchExistingControllerMessage(channel, messageId) {
  if (!channel?.messages?.fetch || !messageId) {
    return null;
  }

  try {
    return await channel.messages.fetch(messageId);
  } catch {
    return null;
  }
}

export async function deleteMusicRequestController(guild, settingsArg = null) {
  const settings = settingsArg ?? await getGuildSettings(guild?.id);
  if (!guild || !settings?.musicRequestChannelId || !settings?.musicControllerMessageId) {
    return false;
  }

  const channel = await resolveRequestChannel(guild, settings);
  const message = await fetchExistingControllerMessage(channel, settings.musicControllerMessageId);
  if (!message?.delete) {
    return false;
  }

  try {
    await message.delete();
    return true;
  } catch {
    return false;
  }
}

export async function syncMusicRequestController(guild, options = {}) {
  if (!guild) {
    return { synced: false, reason: 'no-guild' };
  }

  const settings = options.settings ?? await getGuildSettings(guild.id);
  if (!settings.musicRequestChannelId) {
    return { synced: false, reason: 'not-configured' };
  }

  const channel = await resolveRequestChannel(guild, settings, options.channel ?? null);
  if (!channel?.send) {
    return { synced: false, reason: 'channel-unavailable' };
  }

  const snapshot = getQueueSnapshot(guild.id);
  const payload = {
    embeds: [buildMusicRequestControllerEmbed(guild.id, settings)],
    components: [buildMusicControlRow(Boolean(snapshot.current?.paused))]
  };

  const existingMessage = await fetchExistingControllerMessage(channel, settings.musicControllerMessageId);
  if (existingMessage?.edit) {
    try {
      await existingMessage.edit(payload);
      return { synced: true, message: existingMessage, channel };
    } catch {
      // Fall through and post a replacement message.
    }
  }

  try {
    const message = await channel.send(payload);
    if (message?.id && message.id !== settings.musicControllerMessageId) {
      await updateGuildSettings(guild.id, {
        musicRequestChannelId: channel.id,
        musicControllerMessageId: message.id
      });
    }

    return { synced: true, message, channel };
  } catch {
    return { synced: false, reason: 'send-failed' };
  }
}

export function createMusicRequestChannelNotifications(message) {
  const sync = () => syncMusicRequestController(message.guild, {
    channel: message.channel
  }).catch(() => {});

  return {
    onStart: sync,
    onComplete: sync,
    onStopped: sync,
    onError: sync,
    onRetry: sync,
    onCancelled: sync
  };
}

async function safeReact(message, emoji) {
  if (!message?.react) {
    return;
  }

  try {
    await message.react(emoji);
  } catch {
    // Ignore missing reaction permissions in request channels.
  }
}

async function safeReply(message, content) {
  if (!message?.reply) {
    return;
  }

  try {
    await message.reply({ content });
  } catch {
    // Ignore reply failures to avoid hard errors from request channels.
  }
}

function buildQueuedTrack(track) {
  return {
    title: track.title,
    artist: track.artist,
    durationMs: track.durationMs,
    sourceUrl: track.playbackInput,
    sourceType: track.sourceType,
    thumbnailUrl: track.metadata?.thumbnailUrl,
    metadata: track.metadata,
    lavalinkTrack: track.metadata?.lavalinkTrack ?? null
  };
}

function resolveMessageVoiceChannel(message) {
  return message.member?.voice?.channel ?? null;
}

export async function handleMusicRequestChannelMessage(message, settingsArg = null) {
  if (!message?.guildId || !message?.channelId || message.author?.bot) {
    return false;
  }

  const settings = settingsArg ?? await getGuildSettings(message.guildId);
  if (!settings?.musicRequestChannelId || settings.musicRequestChannelId !== message.channelId) {
    return false;
  }

  const query = String(message.content ?? '').trim();
  if (!query) {
    return true;
  }

  const voiceChannel = resolveMessageVoiceChannel(message);
  if (!voiceChannel) {
    await safeReply(message, '❌ Join a voice channel first to queue music here.');
    return true;
  }

  const accessDecision = getSpeakerAccessDecision(
    message.member,
    message.author.id,
    settings,
    { bypass: hasConfiguredAdminAccess(message.member, settings) }
  );
  if (!accessDecision.allowed) {
    await safeReply(
      message,
      getSpeakerAccessError(accessDecision)?.replace('TTS', 'music playback')
        ?? '❌ You are not allowed to use music playback in this server.'
    );
    return true;
  }

  const voiceSession = getVoiceSessionOptions(settings);
  const notifications = createMusicRequestChannelNotifications(message);

  try {
    if (await isPlaylistMediaUrl(query)) {
      const tracks = await musicResolver.resolvePlaylist(query, {
        guildId: message.guild.id,
        requesterId: message.author.id
      });

      if (!tracks || tracks.length === 0) {
        await safeReply(message, '❌ Could not load any tracks from that playlist.');
        return true;
      }

      await enqueueMusicRequests({
        guild: message.guild,
        voiceChannelId: voiceChannel.id,
        textChannel: message.channel,
        requesterId: message.author.id,
        ...voiceSession,
        source: 'music',
        notifications,
        tracks: tracks.map(buildQueuedTrack)
      });
    } else {
      const resolved = await musicResolver.resolve(query, {
        guildId: message.guild.id,
        requesterId: message.author.id
      });

      await enqueueMusicRequest({
        guild: message.guild,
        voiceChannelId: voiceChannel.id,
        textChannel: message.channel,
        requesterId: message.author.id,
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
        notifications
      });
    }

    await syncMusicRequestController(message.guild, {
      channel: message.channel,
      settings
    }).catch(() => {});
    await safeReact(message, '🎵');
  } catch (error) {
    await safeReply(
      message,
      `❌ ${error instanceof Error ? error.message : 'Unable to queue this music request.'}`
    );
  }

  return true;
}
