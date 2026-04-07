import { generateTTS } from './tts.js';
import { recordHistory } from './historyStore.js';
import { getPlaybackState, joinAndPlay, joinAndPlayInput, joinAndPlayLavalink, isLavalinkPlayer, pausePlayback, requestStopPlayback, resumePlayback, scheduleLavalinkIdleDisconnect, cancelLavalinkIdleDisconnect, stopLavalink } from './voice.js';
import { incrementMetric } from './metrics.js';
import { checkRateLimit } from './rateLimiter.js';
import { createSpeechTrack, createMusicTrack } from './track.js';
import { tryAutoplay } from './autoplay.js';
import { recordAutoplayMemory } from './autoplayMemory.js';
import { getGuildSettings, getVoiceSessionOptions } from './settingsStore.js';

const queues = new Map();

function buildHistoryEntry(item, status) {
  const isMusic = item.kind === 'music';
  return {
    requesterId: item.requesterId,
    languageName: isMusic ? 'Music' : item.metadata.voiceName,
    title: isMusic ? item.title : undefined,
    artist: isMusic ? item.artist : undefined,
    durationMs: isMusic ? item.durationMs : undefined,
    sourceType: isMusic ? item.sourceType : 'tts',
    status,
    source: item.source ?? 'slash'
  };
}

function getQueueState(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, {
      processing: false,
      current: null,
      items: [],
      suppressAutoplayOnce: false,
      shuffleRestoreOrder: null
    });
  }

  return queues.get(guildId);
}

function getMusicPlaybackUrl(item) {
  return item?.metadata?.mirrorPlaybackInput
    ?? item?.metadata?.lavalinkTrack?.info?.uri
    ?? item?.playbackInput
    ?? item?.sourceUrl
    ?? null;
}

function getMusicRequestedUrl(item) {
  return item?.metadata?.canonicalUrl
    ?? item?.metadata?.spotifyUri
    ?? item?.sourceUrl
    ?? item?.playbackInput
    ?? null;
}

function getQueueItemLabel(item) {
  if (!item) {
    return 'Unknown Item';
  }

  return item.kind === 'music'
    ? item.title
    : item.metadata.voiceName;
}

function buildQueueSnapshotItem(item) {
  return {
    kind: item.kind,
    requesterId: item.requesterId,
    label: getQueueItemLabel(item),
    artist: item.kind === 'music' ? (item.artist ?? null) : null,
    durationMs: item.kind === 'music' ? (item.durationMs ?? null) : null,
    totalChunks: item.kind === 'speech' ? item.metadata.chunks.length : null
  };
}

function cloneTrackForReplay(item, overrides = {}) {
  return {
    ...item,
    id: `${item.id}_replay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    requesterId: overrides.requesterId ?? item.requesterId,
    source: overrides.source ?? item.source,
    guild: overrides.guild ?? item.guild,
    voiceChannelId: overrides.voiceChannelId ?? item.voiceChannelId,
    textChannel: overrides.textChannel ?? item.textChannel ?? null,
    idleDisconnectMs: overrides.idleDisconnectMs ?? item.idleDisconnectMs,
    stayConnected: overrides.stayConnected ?? item.stayConnected,
    notifications: overrides.notifications ?? item.notifications,
    metadata: {
      ...(item.metadata ?? {}),
      ...(overrides.metadata ?? {})
    },
    startedAt: null
  };
}

function advanceSpotifyMirrorFallback(item) {
  const fallbackCandidates = item?.metadata?.mirrorFallbackCandidates;
  if (!Array.isArray(fallbackCandidates) || fallbackCandidates.length === 0) {
    return false;
  }

  const nextMirror = fallbackCandidates.shift();
  if (!nextMirror?.playbackInput || !nextMirror?.metadata?.lavalinkTrack) {
    return false;
  }

  item.playbackInput = nextMirror.playbackInput;
  item.sourceType = nextMirror.sourceType ?? item.sourceType;
  item.metadata = {
    ...item.metadata,
    ...nextMirror.metadata,
    mirrorFallbackCandidates: fallbackCandidates,
    lavalinkTrack: nextMirror.metadata.lavalinkTrack,
  };

  return true;
}

function advanceAutoplayFallback(item) {
  const fallbackCandidates = item?.metadata?.autoplayFallbackCandidates;
  if (!Array.isArray(fallbackCandidates) || fallbackCandidates.length === 0) {
    return false;
  }

  const nextTrack = fallbackCandidates.shift();
  if (!nextTrack?.playbackInput || !nextTrack?.metadata?.lavalinkTrack) {
    return false;
  }

  item.title = nextTrack.title ?? item.title;
  item.artist = nextTrack.artist ?? item.artist;
  item.durationMs = nextTrack.durationMs ?? item.durationMs;
  item.playbackInput = nextTrack.playbackInput;
  item.sourceType = nextTrack.sourceType ?? item.sourceType;
  item.metadata = {
    ...item.metadata,
    ...nextTrack.metadata,
    autoplayFallbackCandidates: fallbackCandidates,
  };

  return true;
}

function isRetryableSpotifyMirrorFailure(errorMessage) {
  return errorMessage === 'Audio playback failed.'
    || errorMessage === 'Lavalink failed to load the track.';
}

async function notify(handler, payload) {
  if (!handler) return;

  try {
    await handler(payload);
  } catch {
    // Ignore notification errors so queue processing can continue.
  }
}

function buildMusicQueueTrack(request) {
  const track = createMusicTrack({
    guildId: request.guild.id,
    requesterId: request.requesterId,
    title: request.title,
    artist: request.artist,
    durationMs: request.durationMs,
    sourceUrl: request.sourceUrl,
    sourceType: request.sourceType,
    thumbnailUrl: request.thumbnailUrl,
    source: request.source
  });

  if (request.lavalinkTrack) {
    track.metadata.lavalinkTrack = request.lavalinkTrack;
  }

  if (request.metadata) {
    track.metadata = {
      ...track.metadata,
      ...request.metadata,
      lavalinkTrack: request.lavalinkTrack ?? request.metadata.lavalinkTrack ?? track.metadata.lavalinkTrack
    };
  }

  track.guild = request.guild;
  track.voiceChannelId = request.voiceChannelId;
  track.textChannel = request.textChannel ?? null;
  track.idleDisconnectMs = request.idleDisconnectMs;
  track.stayConnected = Boolean(request.stayConnected);
  track.notifications = request.notifications;

  return track;
}

function getNextQueuePosition(state, addedCount = 1) {
  const firstPosition = state.current ? state.items.length + 2 : state.items.length + 1;
  return {
    firstPosition,
    lastPosition: firstPosition + Math.max(0, addedCount - 1)
  };
}

function getInsertedQueuePosition(state, addedCount = 1) {
  const firstPosition = state.current ? 2 : 1;
  return {
    firstPosition,
    lastPosition: firstPosition + Math.max(0, addedCount - 1)
  };
}

function clearShuffleRestoreOrder(state) {
  state.shuffleRestoreOrder = null;
}

function scheduleQueueProcessing(guildId) {
  processGuildQueue(guildId).catch((error) => {
    console.error('Queue processing error:', error);
  });
}

function recordAutoplayMemoryForItem(item, action) {
  if (item?.kind !== 'music') {
    return;
  }

  recordAutoplayMemory(item.guild?.id ?? item.guildId, {
    track: item,
    action,
    source: item.source === 'autoplay' ? 'autoplay' : 'manual'
  });
}

async function getVoiceChannel(guild, voiceChannelId) {
  const cached = guild.channels.cache.get(voiceChannelId);
  if (cached?.isVoiceBased()) {
    return cached;
  }

  const channel = await guild.channels.fetch(voiceChannelId).catch(() => null);
  return channel?.isVoiceBased() ? channel : null;
}

async function processGuildQueue(guildId) {
  const state = getQueueState(guildId);

  if (state.processing) {
    return;
  }

  state.processing = true;
  let lastIdleDisconnectMs = 60_000;

  while (state.items.length > 0) {
    const item = state.items.shift();
    let playbackStatus = 'failed';
    const latestSettings = await getGuildSettings(guildId).catch(() => null);
    if (latestSettings) {
      const voiceSession = getVoiceSessionOptions(latestSettings);
      item.idleDisconnectMs = voiceSession.idleDisconnectMs;
      item.stayConnected = voiceSession.stayConnected;
    }
    item.startedAt = Date.now();
    state.current = item;
    lastIdleDisconnectMs = item.idleDisconnectMs ?? lastIdleDisconnectMs;

    // Cancel any pending idle disconnect now that a track is starting.
    cancelLavalinkIdleDisconnect(guildId);

    if (item.kind !== 'music') {
      await notify(item.notifications.onStart, {
        languageName: item.metadata.voiceName,
        totalChunks: item.metadata.chunks.length
      });
    }
    incrementMetric('started');

    try {
      const voiceChannel = await getVoiceChannel(item.guild, item.voiceChannelId);
      if (!voiceChannel) {
        throw new Error('The original voice channel is no longer available.');
      }

      if (item.kind === 'music') {
        while (true) {
          const isLavalinkTrack = Boolean(item.metadata?.lavalinkTrack);
          let playResult;

          if (isLavalinkTrack) {
            playResult = await joinAndPlayLavalink(
              item.guild,
              voiceChannel,
              item.metadata.lavalinkTrack,
              {
                idleDisconnectMs: item.idleDisconnectMs,
                stayConnected: item.stayConnected,
                onTrackStart: async () => notify(item.notifications.onStart, {
                  title: item.title,
                  artist: item.artist ?? null,
                  thumbnailUrl: item.metadata?.thumbnailUrl ?? null,
                  durationMs: item.durationMs ?? null,
                  requesterId: item.requesterId ?? null,
                  isAutoplay: item.source === 'autoplay',
                  playbackUrl: getMusicPlaybackUrl(item),
                  requestedUrl: getMusicRequestedUrl(item),
                  mirrored: Boolean(item.metadata?.mirrorPlaybackInput)
                })
              }
            );
          } else {
            playResult = await joinAndPlayInput(
              {
                guild: item.guild,
                voiceChannel,
                idleDisconnectMs: item.idleDisconnectMs,
                stayConnected: item.stayConnected
              },
              item.playbackInput,
              {
                onTrackStart: async () => notify(item.notifications.onStart, {
                  title: item.title,
                  artist: item.artist ?? null,
                  thumbnailUrl: item.metadata?.thumbnailUrl ?? null,
                  durationMs: item.durationMs ?? null,
                  requesterId: item.requesterId ?? null,
                  isAutoplay: item.source === 'autoplay',
                  playbackUrl: getMusicPlaybackUrl(item),
                  requestedUrl: getMusicRequestedUrl(item),
                  mirrored: Boolean(item.metadata?.mirrorPlaybackInput)
                })
              }
            );
          }

          if (playResult.success) {
            break;
          }

          const failedTitle = item.metadata?.mirrorTitle ?? item.title;
          if (isRetryableSpotifyMirrorFailure(playResult.error) && advanceSpotifyMirrorFallback(item)) {
            await notify(item.notifications.onRetry, {
              failedTitle,
              title: item.metadata?.mirrorTitle ?? item.title,
              message: playResult.error
            });
            continue;
          }

          if (item.source === 'autoplay' && isRetryableSpotifyMirrorFailure(playResult.error) && advanceAutoplayFallback(item)) {
            await notify(item.notifications.onRetry, {
              failedTitle,
              title: item.title,
              message: playResult.error
            });
            continue;
          }

          const controlMessage = playResult.stopped
            ? 'Playback stopped.'
            : playResult.skipped
              ? 'Playback skipped.'
              : playResult.error;
          throw new Error(controlMessage);
        }
      } else {
        for (let index = 0; index < item.metadata.chunks.length; index += 1) {
          await notify(item.notifications.onProgress, {
            currentChunk: index + 1,
            totalChunks: item.metadata.chunks.length,
            languageName: item.metadata.voiceName
          });

          const ttsResult = await generateTTS(item.metadata.chunks[index], item.metadata.languageCode);
          if (!ttsResult.success) {
            throw new Error(ttsResult.error);
          }

          const playResult = await joinAndPlay(
            {
              guild: item.guild,
              voiceChannel,
              idleDisconnectMs: item.idleDisconnectMs,
              stayConnected: item.stayConnected
            },
            ttsResult.audioPath
          );

          if (!playResult.success) {
            const controlMessage = playResult.stopped
              ? 'Playback stopped.'
              : playResult.skipped
                ? 'Playback skipped.'
                : playResult.error;
            throw new Error(controlMessage);
          }
        }
      }

      if (item.kind === 'music') {
        await notify(item.notifications.onComplete, {
          title: item.title,
          idleDisconnectMs: item.idleDisconnectMs
        });
      } else {
        await notify(item.notifications.onComplete, {
          languageName: item.metadata.voiceName,
          totalChunks: item.metadata.chunks.length,
          idleDisconnectMs: item.idleDisconnectMs,
          stayConnected: item.stayConnected
        });
      }
      playbackStatus = 'completed';
      incrementMetric('completed');
      await recordHistory(item.guild.id, buildHistoryEntry(item, 'completed'));
      recordAutoplayMemoryForItem(item, 'played');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Speech queue processing failed.';
      const stopped = message === 'Playback stopped.';
      const skipped = message === 'Playback skipped.';

      if (stopped || skipped) {
        playbackStatus = skipped ? 'skipped' : 'stopped';
        await notify(item.notifications.onStopped, item.kind === 'music'
          ? { skipped, message, title: item.title }
          : { skipped, message });
        incrementMetric(skipped ? 'skipped' : 'stopped');
        await recordHistory(item.guild.id, buildHistoryEntry(item, skipped ? 'skipped' : 'stopped'));
        if (skipped) {
          recordAutoplayMemoryForItem(item, 'skipped');
        }
      } else {
        playbackStatus = 'failed';
        await notify(item.notifications.onError, { message });
        incrementMetric('failed');
        await recordHistory(item.guild.id, buildHistoryEntry(item, 'failed'));
        recordAutoplayMemoryForItem(item, 'failed');
      }
    } finally {
      state._lastPlayedItem = state.current;
      state._lastPlayedStatus = playbackStatus;
      state.current = null;
    }
  }

  state.processing = false;
  if (state.items.length === 0) {
    clearShuffleRestoreOrder(state);
  }

  // Queue is empty — try autoplay from the last finished music item before
  // allowing the active playback backend to idle-disconnect.
  const lastItem = state.current ?? state._lastPlayedItem;
  if (state.suppressAutoplayOnce) {
    state.suppressAutoplayOnce = false;
    state._lastPlayedStatus = null;
  } else {
    const canAutoplayFromLastItem = (
      state._lastPlayedStatus === 'completed'
      || state._lastPlayedStatus === 'skipped'
      || (state._lastPlayedStatus === 'failed' && lastItem?.source === 'autoplay')
    );
    if (lastItem?.kind === 'music' && canAutoplayFromLastItem) {
      const autoplayTrack = await tryAutoplay(guildId, lastItem).catch(() => null);
      if (autoplayTrack) {
        // Re-enqueue the autoplay track using the same guild/channel context.
        state.items.push(autoplayTrack);
        state._lastPlayedItem = null;
        state._lastPlayedStatus = null;
        processGuildQueue(guildId).catch(() => {});
        return;
      }
    }
  }

  if (isLavalinkPlayer(guildId)) {
    scheduleLavalinkIdleDisconnect(guildId, lastIdleDisconnectMs);
  }
}

export async function enqueueSpeechRequest(request) {
  const state = getQueueState(request.guild.id);
  const queuedCountForUser = state.items.filter((item) => item.requesterId === request.requesterId).length;
  const rateLimit = checkRateLimit({
    guildId: request.guild.id,
    userId: request.requesterId,
    queuedCountForUser
  });

  if (!rateLimit.allowed) {
    throw new Error(rateLimit.error);
  }

  const track = createSpeechTrack({
    guildId: request.guild.id,
    requesterId: request.requesterId,
    title: request.title,
    languageCode: request.languageCode,
    voiceName: request.voiceName,
    chunks: request.chunks,
    source: request.source
  });

  track.guild = request.guild;
  track.voiceChannelId = request.voiceChannelId;
  track.idleDisconnectMs = request.idleDisconnectMs;
  track.stayConnected = Boolean(request.stayConnected);
  track.notifications = request.notifications;

  state.items.push(track);
  incrementMetric('enqueued');

  const position = state.current ? state.items.length + 1 : state.items.length;
  scheduleQueueProcessing(request.guild.id);

  return {
    position,
    totalChunks: request.chunks.length
  };
}

export async function enqueueMusicRequest(request) {
  const result = await enqueueMusicRequests({
    ...request,
    tracks: [request]
  });

  return { position: result.firstPosition };
}

export async function enqueueMusicRequests(request) {
  const state = getQueueState(request.guild.id);
  const queuedCountForUser = state.items.filter((item) => item.requesterId === request.requesterId).length;
  const tracks = Array.isArray(request.tracks) ? request.tracks : [];
  const placement = request.placement === 'next' ? 'next' : 'end';
  const rateLimit = checkRateLimit({
    guildId: request.guild.id,
    userId: request.requesterId,
    queuedCountForUser,
    kind: 'music',
    ignoreQueueDepth: tracks.length > 1
  });

  if (!rateLimit.allowed) {
    throw new Error(rateLimit.error);
  }

  if (tracks.length === 0) {
    return { count: 0, firstPosition: null, lastPosition: null };
  }

  const queueTracks = tracks.map((track) => buildMusicQueueTrack({
    guild: request.guild,
    voiceChannelId: request.voiceChannelId,
    textChannel: request.textChannel ?? null,
    requesterId: request.requesterId,
    idleDisconnectMs: request.idleDisconnectMs,
    source: request.source,
    notifications: request.notifications,
    ...track
  }));

  const { firstPosition, lastPosition } = placement === 'next'
    ? getInsertedQueuePosition(state, queueTracks.length)
    : getNextQueuePosition(state, queueTracks.length);

  if (placement === 'next') {
    state.items.splice(0, 0, ...queueTracks);
  } else {
    state.items.push(...queueTracks);
  }

  for (const _track of queueTracks) {
    incrementMetric('enqueued');
  }

  scheduleQueueProcessing(request.guild.id);

  return {
    count: queueTracks.length,
    firstPosition,
    lastPosition
  };
}

export function getQueueSnapshot(guildId) {
  const state = getQueueState(guildId);
  const playbackState = getPlaybackState(guildId);

  return {
    current: state.current
      ? {
          kind: state.current.kind,
          requesterId: state.current.requesterId,
          label: getQueueItemLabel(state.current),
          artist: state.current.kind === 'music' ? (state.current.artist ?? null) : null,
          durationMs: state.current.kind === 'music' ? (state.current.durationMs ?? null) : null,
          totalChunks: state.current.kind === 'speech' ? state.current.metadata.chunks.length : null,
          startedAt: state.current.startedAt ?? null,
          paused: playbackState?.paused ?? false,
          sourceUrl: state.current.kind === 'music' ? state.current.playbackInput : null
        }
      : null,
    queued: state.items.map((item) => buildQueueSnapshotItem(item))
  };
}

export function getCurrentQueueItem(guildId) {
  const state = getQueueState(guildId);
  return state.current ?? null;
}

export function getPreviousQueueItem(guildId) {
  const state = getQueueState(guildId);
  return state._lastPlayedItem ?? null;
}

export function getQueuedMusicItems(guildId, options = {}) {
  const state = getQueueState(guildId);
  const includeCurrent = options.includeCurrent !== false;
  const items = [];

  if (includeCurrent && state.current?.kind === 'music') {
    items.push(state.current);
  }

  items.push(...state.items.filter((item) => item.kind === 'music'));
  return items.map((item) => ({ ...item, metadata: { ...item.metadata } }));
}

export function getAllQueueSnapshots() {
  return [...queues.entries()].map(([guildId]) => ({
    guildId,
    ...getQueueSnapshot(guildId)
  }));
}

export async function removeQueuedItemsForUser(guildId, userId, count = 1) {
  const state = getQueueState(guildId);
  let removed = 0;
  const remaining = [];

  for (const item of state.items) {
    if (item.requesterId === userId && removed < count) {
      removed += 1;
      await notify(item.notifications.onCancelled, {
        message: 'Your queued TTS message was removed from the queue.'
      });
      continue;
    }

    remaining.push(item);
  }

  state.items = remaining;
  if (removed > 0) {
    clearShuffleRestoreOrder(state);
  }
  return removed;
}

export async function clearQueuedItems(guildId) {
  const state = getQueueState(guildId);
  const clearedItems = state.items.splice(0, state.items.length);
  clearShuffleRestoreOrder(state);

  for (const item of clearedItems) {
    await notify(item.notifications.onCancelled, {
      message: 'Your queued item was cleared from the queue.'
    });
  }

  return {
    cleared: clearedItems.length
  };
}

function shuffleArray(items) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export async function shuffleQueuedMusic(guildId) {
  const state = getQueueState(guildId);
  const queuedMusic = state.items.filter((item) => item.kind === 'music');

  if (queuedMusic.length === 0) {
    return {
      shuffled: false,
      reason: 'no-music'
    };
  }

  if (queuedMusic.length < 2) {
    return {
      shuffled: false,
      reason: 'not-enough-music',
      count: queuedMusic.length
    };
  }

  const originalOrder = queuedMusic.map((item) => item.id);
  let shuffledMusic = queuedMusic;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    shuffledMusic = shuffleArray(queuedMusic);
    const changed = shuffledMusic.some((item, index) => item.id !== originalOrder[index]);
    if (changed) {
      break;
    }
  }

  let musicIndex = 0;
  state.items = state.items.map((item) => {
    if (item.kind !== 'music') {
      return item;
    }

    const nextItem = shuffledMusic[musicIndex];
    musicIndex += 1;
    return nextItem;
  });

  state.shuffleRestoreOrder = originalOrder;

  return {
    shuffled: true,
    count: queuedMusic.length
  };
}

export async function unshuffleQueuedMusic(guildId) {
  const state = getQueueState(guildId);
  const restoreOrder = Array.isArray(state.shuffleRestoreOrder) ? state.shuffleRestoreOrder : null;
  const queuedMusic = state.items.filter((item) => item.kind === 'music');

  if (!restoreOrder || queuedMusic.length === 0) {
    return {
      restored: false,
      reason: queuedMusic.length === 0 ? 'no-music' : 'not-shuffled'
    };
  }

  const currentOrder = queuedMusic.map((item) => item.id);
  const musicById = new Map(queuedMusic.map((item) => [item.id, item]));
  const restoredMusic = [];

  for (const itemId of restoreOrder) {
    const item = musicById.get(itemId);
    if (item) {
      restoredMusic.push(item);
      musicById.delete(itemId);
    }
  }

  for (const item of queuedMusic) {
    if (musicById.has(item.id)) {
      restoredMusic.push(item);
      musicById.delete(item.id);
    }
  }

  let musicIndex = 0;
  state.items = state.items.map((item) => {
    if (item.kind !== 'music') {
      return item;
    }

    const nextItem = restoredMusic[musicIndex];
    musicIndex += 1;
    return nextItem;
  });

  clearShuffleRestoreOrder(state);

  const changed = restoredMusic.some((item, index) => item.id !== currentOrder[index]);
  return {
    restored: true,
    count: queuedMusic.length,
    unchanged: !changed
  };
}

export async function removeQueuedItemAtPosition(guildId, position) {
  const state = getQueueState(guildId);

  if (!Number.isInteger(position) || position < 1 || position > state.items.length) {
    return {
      removed: false,
      reason: state.items.length === 0 ? 'queue-empty' : 'out-of-range',
      queueLength: state.items.length
    };
  }

  const [removedItem] = state.items.splice(position - 1, 1);
  clearShuffleRestoreOrder(state);
  await notify(removedItem.notifications.onCancelled, {
    message: 'Your queued item was removed from the queue.'
  });

  return {
    removed: true,
    position,
    item: buildQueueSnapshotItem(removedItem)
  };
}

export async function moveQueuedItem(guildId, fromPosition, toPosition) {
  const state = getQueueState(guildId);
  const queueLength = state.items.length;

  if (!Number.isInteger(fromPosition) || !Number.isInteger(toPosition)) {
    return {
      moved: false,
      reason: queueLength === 0 ? 'queue-empty' : 'out-of-range',
      queueLength
    };
  }

  if (
    fromPosition < 1
    || fromPosition > queueLength
    || toPosition < 1
    || toPosition > queueLength
  ) {
    return {
      moved: false,
      reason: queueLength === 0 ? 'queue-empty' : 'out-of-range',
      queueLength
    };
  }

  if (fromPosition === toPosition) {
    return {
      moved: true,
      unchanged: true,
      fromPosition,
      toPosition,
      item: buildQueueSnapshotItem(state.items[fromPosition - 1])
    };
  }

  const [item] = state.items.splice(fromPosition - 1, 1);
  state.items.splice(toPosition - 1, 0, item);
  clearShuffleRestoreOrder(state);

  return {
    moved: true,
    fromPosition,
    toPosition,
    item: buildQueueSnapshotItem(item)
  };
}

export async function skipToQueuedPosition(guildId, position, options = {}) {
  const state = getQueueState(guildId);
  const stopPlayback = options.stopPlayback ?? skipCurrentSpeech;

  if (!state.current) {
    return {
      skipped: false,
      reason: 'nothing-playing',
      queueLength: state.items.length
    };
  }

  if (!Number.isInteger(position) || position < 1 || position > state.items.length) {
    return {
      skipped: false,
      reason: state.items.length === 0 ? 'queue-empty' : 'out-of-range',
      queueLength: state.items.length
    };
  }

  const originalItems = [...state.items];
  const discardedItems = originalItems.slice(0, position - 1);
  const nextItems = originalItems.slice(position - 1);
  const targetItem = nextItems[0];

  state.items = nextItems;
  clearShuffleRestoreOrder(state);

  if (!stopPlayback(guildId)) {
    state.items = originalItems;
    return {
      skipped: false,
      reason: 'nothing-playing',
      queueLength: originalItems.length
    };
  }

  for (const item of discardedItems) {
    await notify(item.notifications.onCancelled, {
      message: 'Your queued item was skipped over by a queue jump.'
    });
  }

  return {
    skipped: true,
    discardedCount: discardedItems.length,
    target: buildQueueSnapshotItem(targetItem)
  };
}

export async function stopAndClearGuildQueue(guildId) {
  const state = getQueueState(guildId);
  const clearedItems = state.items.splice(0, state.items.length);
  clearShuffleRestoreOrder(state);
  state.suppressAutoplayOnce = true;
  state._lastPlayedStatus = 'stopped';

  for (const item of clearedItems) {
    await notify(item.notifications.onCancelled, {
      message: 'Your queued TTS message was cleared.'
    });
  }

  const stoppedCurrent = requestStopPlayback(guildId, 'stopped');
  const stoppedLavalink = stopLavalink(guildId, 'stopped');

  return {
    cleared: clearedItems.length,
    stoppedCurrent: stoppedCurrent || stoppedLavalink
  };
}

export function skipCurrentSpeech(guildId) {
  const skipped = requestStopPlayback(guildId, 'skipped');
  const skippedLavalink = stopLavalink(guildId, 'skipped');
  return skipped || skippedLavalink;
}

export function pauseCurrentPlayback(guildId) {
  return pausePlayback(guildId);
}

export function resumeCurrentPlayback(guildId) {
  return resumePlayback(guildId);
}

export async function replayPreviousTrack(guildId, request = {}) {
  const state = getQueueState(guildId);
  const previousItem = state._lastPlayedItem;

  if (!previousItem || previousItem.kind !== 'music') {
    return {
      replayed: false,
      reason: 'no-previous'
    };
  }

  if (state.current && state.current.kind !== 'music') {
    return {
      replayed: false,
      reason: 'speech-active'
    };
  }

  const replayContext = {
    requesterId: request.requesterId ?? previousItem.requesterId,
    source: request.source ?? 'music',
    guild: request.guild ?? previousItem.guild,
    voiceChannelId: request.voiceChannelId ?? previousItem.voiceChannelId,
    textChannel: request.textChannel ?? previousItem.textChannel ?? null,
    idleDisconnectMs: request.idleDisconnectMs ?? previousItem.idleDisconnectMs,
    stayConnected: request.stayConnected ?? previousItem.stayConnected,
    notifications: request.notifications ?? previousItem.notifications
  };

  const replayTrack = cloneTrackForReplay(previousItem, replayContext);

  if (state.current?.kind === 'music') {
    const currentReplay = cloneTrackForReplay(state.current, {
      guild: replayContext.guild ?? state.current.guild,
      voiceChannelId: replayContext.voiceChannelId ?? state.current.voiceChannelId,
      textChannel: replayContext.textChannel ?? state.current.textChannel ?? null,
      idleDisconnectMs: replayContext.idleDisconnectMs ?? state.current.idleDisconnectMs,
      stayConnected: replayContext.stayConnected ?? state.current.stayConnected,
      notifications: replayContext.notifications ?? state.current.notifications
    });

    state.items.unshift(currentReplay);
    state.items.unshift(replayTrack);
    clearShuffleRestoreOrder(state);

    if (!skipCurrentSpeech(guildId)) {
      state.items.shift();
      state.items.shift();
      return {
        replayed: false,
        reason: 'nothing-playing'
      };
    }

    return {
      replayed: true,
      position: 1,
      replayedItem: buildQueueSnapshotItem(replayTrack),
      preservedCurrent: buildQueueSnapshotItem(currentReplay)
    };
  }

  state.items.unshift(replayTrack);
  clearShuffleRestoreOrder(state);
  scheduleQueueProcessing(guildId);

  return {
    replayed: true,
    position: 1,
    replayedItem: buildQueueSnapshotItem(replayTrack)
  };
}
