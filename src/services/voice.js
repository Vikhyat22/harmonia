import {
  AudioPlayerStatus,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel
} from '@discordjs/voice';
import { PermissionsBitField } from '../lib/discord.js';
import { cleanupAudio } from './tts.js';
import { claimGuildPlayback, releaseGuildPlayback } from './playbackRegistry.js';
import { getLavalinkManager } from './lavalink.js';

export const DEFAULT_IDLE_DISCONNECT_MS = 60_000;

const activeConnections = new Map();
const lavalinkStopReasons = new Map();
const lavalinkIdleTimers = new Map();
const lavalinkStayConnectedGuilds = new Set();

async function getBotMember(guild) {
  if (!guild) {
    return null;
  }

  return guild.members.me ?? guild.members.fetchMe();
}

function clearIdleDisconnect(entry) {
  if (!entry?.idleTimer) return;
  clearTimeout(entry.idleTimer);
  entry.idleTimer = null;
}

function destroyConnection(guildId) {
  const entry = activeConnections.get(guildId);
  if (!entry) return;

  clearIdleDisconnect(entry);
  activeConnections.delete(guildId);
  releaseGuildPlayback(guildId);

  try {
    entry.player.stop(true);
  } catch {
    // Ignore stop errors during cleanup.
  }

  entry.connection.destroy();
}

function destroyLavalinkPlayer(guildId) {
  cancelLavalinkIdleDisconnect(guildId);
  try {
    const player = getLavalinkManager().getPlayer(guildId);
    if (player) {
      player.destroy().catch(() => {});
    }
  } catch {
    // Manager may not be initialized; ignore.
  }
}

function scheduleIdleDisconnect(guildId) {
  const entry = activeConnections.get(guildId);
  if (!entry) return;

  clearIdleDisconnect(entry);
  if (entry.stayConnected) {
    return;
  }
  entry.idleTimer = setTimeout(() => {
    destroyConnection(guildId);
  }, entry.idleDisconnectMs);
}

async function validateVoiceChannelAccess(guild, voiceChannel) {
  if (!guild) {
    return { success: false, error: 'I could not resolve this server from the interaction.' };
  }

  const botMember = await getBotMember(guild);
  if (!botMember) {
    return { success: false, error: 'I could not resolve my bot member in this server.' };
  }
  const permissions = voiceChannel.permissionsFor(botMember);

  if (!permissions?.has(PermissionsBitField.Flags.ViewChannel)) {
    return { success: false, error: `I cannot view ${voiceChannel.name}.` };
  }

  if (!permissions.has(PermissionsBitField.Flags.Connect)) {
    return { success: false, error: `I do not have permission to connect to ${voiceChannel.name}.` };
  }

  if (!permissions.has(PermissionsBitField.Flags.Speak)) {
    return { success: false, error: `I do not have permission to speak in ${voiceChannel.name}.` };
  }

  if (voiceChannel.full && !voiceChannel.members.has(botMember.id)) {
    return { success: false, error: `${voiceChannel.name} is full right now.` };
  }

  return { success: true };
}

function createConnectionEntry(guild, voiceChannel, idleDisconnectMs, stayConnected = false) {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  const entry = {
    connection,
    player,
    idleTimer: null,
    idleDisconnectMs,
    stayConnected,
    stopReason: null
  };

  connection.on('error', (error) => {
    console.error('Voice connection error:', error);
    destroyConnection(guild.id);
  });

  activeConnections.set(guild.id, entry);
  return entry;
}

async function ensureConnection({ guild, voiceChannel, idleDisconnectMs = DEFAULT_IDLE_DISCONNECT_MS, stayConnected = false }) {
  const access = await validateVoiceChannelAccess(guild, voiceChannel);
  if (!access.success) {
    return access;
  }

  const existingEntry = activeConnections.get(guild.id);
  if (existingEntry) {
    existingEntry.idleDisconnectMs = idleDisconnectMs;
    existingEntry.stayConnected = stayConnected;
    clearIdleDisconnect(existingEntry);

    if (existingEntry.connection.joinConfig.channelId === voiceChannel.id) {
      await entersState(existingEntry.connection, VoiceConnectionStatus.Ready, 15_000);
      return { success: true, entry: existingEntry };
    }

    destroyConnection(guild.id);
  }

  const orphanConnection = getVoiceConnection(guild.id);
  if (orphanConnection) {
    orphanConnection.destroy();
  }

  const entry = createConnectionEntry(guild, voiceChannel, idleDisconnectMs, stayConnected);
  await entersState(entry.connection, VoiceConnectionStatus.Ready, 15_000);
  return { success: true, entry };
}

export async function joinChannel({ guild, voiceChannel, idleDisconnectMs = DEFAULT_IDLE_DISCONNECT_MS, stayConnected = false }) {
  if (!guild) {
    return { success: false, error: 'I could not resolve this server from the interaction.' };
  }

  if (!voiceChannel) {
    return { success: false, error: 'You must choose a voice channel first.' };
  }

  try {
    const result = await ensureConnection({ guild, voiceChannel, idleDisconnectMs, stayConnected });
    if (!result.success) {
      return result;
    }

    scheduleIdleDisconnect(guild.id);
    return { success: true };
  } catch (error) {
    console.error('Voice Error:', error);
    destroyConnection(guild.id);
    return { success: false, error: 'Unable to join the voice channel.' };
  }
}

export async function joinAndPlay({ guild, voiceChannel, idleDisconnectMs = DEFAULT_IDLE_DISCONNECT_MS, stayConnected = false }, audioPath) {
  return joinAndPlayInput(
    { guild, voiceChannel, idleDisconnectMs, stayConnected },
    audioPath,
    { cleanup: cleanupAudio }
  );
}

export async function joinAndPlayInput(
  { guild, voiceChannel, idleDisconnectMs = DEFAULT_IDLE_DISCONNECT_MS, stayConnected = false },
  input,
  options = {}
) {
  const cleanup = options.cleanup ?? (async () => {});
  const onTrackStart = options.onTrackStart ?? (async () => {});

  if (!guild) {
    await cleanup(input);
    return { success: false, error: 'I could not resolve this server from the interaction.' };
  }

  if (!voiceChannel) {
    await cleanup(input);
    return { success: false, error: 'You must be in a voice channel first.' };
  }

  if (!claimGuildPlayback(guild.id)) {
    await cleanup(input);
    return {
      success: false,
      error: 'I am already speaking in this server. Please wait for the current message to finish.'
    };
  }

  try {
    const result = await ensureConnection({ guild, voiceChannel, idleDisconnectMs, stayConnected });
    if (!result.success) {
      releaseGuildPlayback(guild.id);
      await cleanupAudio(audioPath);
      return result;
    }

    const { entry } = result;
    clearIdleDisconnect(entry);
    entry.stopReason = null;

    const resource = createAudioResource(input);
    let trackStarted = false;
    entry.player.play(resource);

    return await new Promise((resolve) => {
      let finished = false;
      let handleIdle;
      let handleError;
      let handlePlaying;

      const cleanupPlaybackListeners = () => {
        if (handleIdle) {
          entry.player.off(AudioPlayerStatus.Idle, handleIdle);
        }

        if (handleError) {
          entry.player.off('error', handleError);
        }

        if (handlePlaying) {
          entry.player.off(AudioPlayerStatus.Playing, handlePlaying);
        }
      };

      const finalize = async (resultPayload) => {
        if (finished) return;
        finished = true;
        cleanupPlaybackListeners();

        releaseGuildPlayback(guild.id);

        if (resultPayload.success || resultPayload.stopped || resultPayload.skipped) {
          scheduleIdleDisconnect(guild.id);
        } else {
          destroyConnection(guild.id);
        }

        await cleanup(input);
        resolve(resultPayload);
      };

      handleIdle = () => {
        const stopReason = entry.stopReason;
        entry.stopReason = null;

        if (stopReason === 'skipped') {
          finalize({ success: false, skipped: true, error: 'Playback skipped.' });
          return;
        }

        if (stopReason === 'stopped') {
          finalize({ success: false, stopped: true, error: 'Playback stopped.' });
          return;
        }

        finalize({ success: true });
      };

      handleError = (error) => {
        console.error('Player error:', error);
        entry.stopReason = null;
        finalize({ success: false, error: 'Audio playback failed.' });
      };

      handlePlaying = () => {
        if (trackStarted) return;
        trackStarted = true;
        Promise.resolve(onTrackStart()).catch(() => {});
      };

      entry.player.once(AudioPlayerStatus.Playing, handlePlaying);
      entry.player.once(AudioPlayerStatus.Idle, handleIdle);
      entry.player.once('error', handleError);
    });
  } catch (error) {
    console.error('Voice Error:', error);
    destroyConnection(guild.id);
    await cleanup(input);
    return { success: false, error: 'Unable to join the voice channel.' };
  }
}

export function pausePlayback(guildId) {
  const entry = activeConnections.get(guildId);
  if (!entry) {
    return false;
  }

  return entry.player.pause();
}

export function resumePlayback(guildId) {
  const entry = activeConnections.get(guildId);
  if (!entry) {
    return false;
  }

  return entry.player.unpause();
}

export function getPlaybackState(guildId) {
  const entry = activeConnections.get(guildId);
  if (!entry) {
    return null;
  }

  return {
    status: entry.player.state.status,
    paused: entry.player.state.status === AudioPlayerStatus.Paused
  };
}

export function requestStopPlayback(guildId, reason = 'stopped') {
  const entry = activeConnections.get(guildId);
  if (!entry) {
    return false;
  }

  entry.stopReason = reason;
  return entry.player.stop(true);
}

export function leaveChannel(guildId) {
  const hasConnection = activeConnections.has(guildId) || Boolean(getVoiceConnection(guildId));
  const hasLavalinkPlayer = Boolean(getLavalinkPlayer(guildId));

  if (!hasConnection && !hasLavalinkPlayer) {
    return false;
  }

  destroyConnection(guildId);
  destroyLavalinkPlayer(guildId);
  return true;
}

export function isLavalinkPlayer(guildId) {
  try {
    return Boolean(getLavalinkManager().getPlayer(guildId));
  } catch {
    return false;
  }
}

export function getLavalinkPlayer(guildId) {
  try {
    return getLavalinkManager().getPlayer(guildId) ?? null;
  } catch {
    return null;
  }
}

export async function joinAndPlayLavalink(guild, voiceChannel, lavalinkTrack, options = {}) {
  if (!guild) {
    return { success: false, error: 'I could not resolve this server from the interaction.' };
  }

  if (!voiceChannel) {
    return { success: false, error: 'You must be in a voice channel first.' };
  }

  if (!claimGuildPlayback(guild.id)) {
    return {
      success: false,
      error: 'I am already speaking in this server. Please wait for the current message to finish.'
    };
  }

  try {
    const onTrackStart = options.onTrackStart ?? (async () => {});
    const stayConnected = Boolean(options.stayConnected);
    const expectedTrackIdentity = getTrackIdentity(lavalinkTrack);
    // Destroy any active @discordjs/voice connection for this guild first.
    // If one exists its guild adapter will intercept the VOICE_SERVER_UPDATE
    // that Lavalink needs, causing a silent voice conflict.
    // NOTE: We do NOT call destroyConnection() here because it calls
    // releaseGuildPlayback(), which would drop the lock we just claimed.
    const existingVoiceEntry = activeConnections.get(guild.id);
    if (existingVoiceEntry) {
      clearIdleDisconnect(existingVoiceEntry);
      activeConnections.delete(guild.id);
      try { existingVoiceEntry.player.stop(true); } catch { /* ignore */ }
      existingVoiceEntry.connection.destroy();
    }
    const orphanConn = getVoiceConnection(guild.id);
    if (orphanConn) orphanConn.destroy();

    const manager = getLavalinkManager();
    let player = manager.getPlayer(guild.id);

    if (!player) {
      const nodes = manager.nodeManager.leastUsedNodes();
      if (!nodes.length) {
        releaseGuildPlayback(guild.id);
        return { success: false, error: 'No Lavalink nodes available.' };
      }
      player = manager.createPlayer({
        guildId: guild.id,
        voiceChannelId: voiceChannel.id,
        selfDeaf: true,
      });
    }

    if (!player.connected) await player.connect();
    if (stayConnected) {
      lavalinkStayConnectedGuilds.add(guild.id);
      cancelLavalinkIdleDisconnect(guild.id);
    } else {
      lavalinkStayConnectedGuilds.delete(guild.id);
    }

    // Queue processing is serialized, so by the time we start the next item the
    // previous queue item has already resolved. Calling stopPlaying() again here
    // can create duplicate stop events that get applied during a skip-to-next
    // handoff. We only need to replace the stale queue state with the target
    // track before calling play().
    player.queue.splice(0, player.queue.tracks?.length ?? 0);
    player.queue.current = null;

    await player.queue.add(lavalinkTrack);
    player.queue.current = lavalinkTrack;

    // A stop/skip may have been requested while we were awaiting connect() or
    // queue.add(). If so, bail out now before play() starts — otherwise the
    // track would start playing and the stale stop reason would only be
    // consumed when the track naturally ends, causing it to play through.
    const earlyStopReason = lavalinkStopReasons.get(guild.id);
    if (earlyStopReason === 'stopped' || earlyStopReason === 'skipped') {
      lavalinkStopReasons.delete(guild.id);
      releaseGuildPlayback(guild.id);
      if (earlyStopReason === 'stopped') {
        destroyLavalinkPlayer(guild.id);
      }
      return earlyStopReason === 'skipped'
        ? { success: false, skipped: true, error: 'Playback skipped.' }
        : { success: false, stopped: true, error: 'Playback stopped.' };
    }

    return await new Promise((resolve) => {
      let finished = false;
      let trackStarted = false;

      const finish = (result) => {
        if (finished) return;
        finished = true;
        manager.off('trackStart', handleTrackStart);
        manager.off('trackEnd', handleTrackEnd);
        manager.off('trackError', handleTrackError);
        manager.off('playerSocketClosed', handleSocketClosed);
        releaseGuildPlayback(guild.id);
        // Destroy the player only on a deliberate stop (not skip) so the bot
        // leaves the voice channel when playback is fully stopped. On skip
        // the bot stays connected so the next queued track plays seamlessly
        // without a leave/rejoin.
        if (result.stopped) {
          destroyLavalinkPlayer(guild.id);
        }
        resolve(result);
      };

      const handleTrackStart = (p, track) => {
        if (p.guildId !== guild.id) return;
        if (!isExpectedLavalinkTrack(track, expectedTrackIdentity)) return;
        if (trackStarted) return;
        trackStarted = true;
        Promise.resolve(onTrackStart()).catch(() => {});
      };

      const handleTrackEnd = (p, track, payload) => {
        if (p.guildId !== guild.id) return;
        if (!isExpectedLavalinkTrack(track, expectedTrackIdentity)) return;
        const intendedReason = lavalinkStopReasons.get(guild.id);
        lavalinkStopReasons.delete(guild.id);
        const reason = intendedReason ?? payload?.reason;
        // Lavalink can emit `replaced` for the previous track when a new one
        // starts. That should not resolve the current queue item as completed.
        if (reason === 'replaced') {
          return;
        }
        if (reason === 'skipped') {
          finish({ success: false, skipped: true, error: 'Playback skipped.' });
        } else if (reason === 'stopped' || reason === 'cleanup') {
          finish({ success: false, stopped: true, error: 'Playback stopped.' });
        } else if (reason === 'loadFailed') {
          finish({ success: false, error: 'Lavalink failed to load the track.' });
        } else {
          finish({ success: true });
        }
      };

      const handleTrackError = (p, track, payload) => {
        if (p.guildId !== guild.id) return;
        if (!isExpectedLavalinkTrack(track, expectedTrackIdentity)) return;
        console.error('Lavalink track error:', payload?.exception?.message ?? payload);
        finish({ success: false, error: 'Audio playback failed.' });
      };

      // Fires when Lavalink loses the Discord voice WebSocket (e.g. can't connect to voice server)
      const handleSocketClosed = (p, payload) => {
        if (p.guildId !== guild.id) return;
        console.error('Lavalink voice socket closed:', payload?.code, payload?.reason);
        finish({ success: false, error: 'Voice connection to Discord failed.' });
      };

      manager.on('trackStart', handleTrackStart);
      manager.on('trackEnd', handleTrackEnd);
      manager.on('trackError', handleTrackError);
      manager.on('playerSocketClosed', handleSocketClosed);

      player.play({ paused: false })
          .catch((err) => {
            console.error('Lavalink player.play() error:', err);
            finish({ success: false, error: err.message });
          });
    });
  } catch (error) {
    console.error('Lavalink Error:', error);
    releaseGuildPlayback(guild.id);
    return { success: false, error: 'Unable to play Lavalink track.' };
  }
}

export function pauseLavalink(guildId) {
  const player = getLavalinkPlayer(guildId);
  if (!player) return false;
  try {
    player.pause();
    return true;
  } catch {
    return false;
  }
}

export function resumeLavalink(guildId) {
  const player = getLavalinkPlayer(guildId);
  if (!player) return false;
  try {
    player.resume();
    return true;
  } catch {
    return false;
  }
}

export function stopLavalink(guildId, reason = 'stopped') {
  const player = getLavalinkPlayer(guildId);
  if (!player) return false;
  try {
    lavalinkStopReasons.set(guildId, reason);
    player.stopPlaying(false, false);
    return true;
  } catch {
    lavalinkStopReasons.delete(guildId);
    return false;
  }
}

export function scheduleLavalinkIdleDisconnect(guildId, delayMs = DEFAULT_IDLE_DISCONNECT_MS, options = {}) {
  if (options.stayConnected ?? lavalinkStayConnectedGuilds.has(guildId)) {
    cancelLavalinkIdleDisconnect(guildId);
    return;
  }
  cancelLavalinkIdleDisconnect(guildId);
  const timer = setTimeout(() => {
    lavalinkIdleTimers.delete(guildId);
    destroyLavalinkPlayer(guildId);
  }, delayMs);
  lavalinkIdleTimers.set(guildId, timer);
}

export function updateConnectionPersistence(guildId, { stayConnected = false, idleDisconnectMs = DEFAULT_IDLE_DISCONNECT_MS } = {}) {
  const entry = activeConnections.get(guildId);
  if (entry) {
    entry.stayConnected = Boolean(stayConnected);
    entry.idleDisconnectMs = idleDisconnectMs;

    if (entry.stayConnected) {
      clearIdleDisconnect(entry);
    } else if (entry.player.state.status === AudioPlayerStatus.Idle) {
      scheduleIdleDisconnect(guildId);
    }
  }

  if (stayConnected) {
    lavalinkStayConnectedGuilds.add(guildId);
    cancelLavalinkIdleDisconnect(guildId);
  } else {
    lavalinkStayConnectedGuilds.delete(guildId);
    const player = getLavalinkPlayer(guildId);
    if (player && !player.playing && !player.paused) {
      scheduleLavalinkIdleDisconnect(guildId, idleDisconnectMs);
    }
  }
}

export function cancelLavalinkIdleDisconnect(guildId) {
  const timer = lavalinkIdleTimers.get(guildId);
  if (timer) {
    clearTimeout(timer);
    lavalinkIdleTimers.delete(guildId);
  }
}

export function shutdownVoiceSystem() {
  for (const guildId of [...activeConnections.keys()]) {
    destroyConnection(guildId);
  }
  for (const guildId of [...lavalinkIdleTimers.keys()]) {
    cancelLavalinkIdleDisconnect(guildId);
  }
  lavalinkStayConnectedGuilds.clear();
}

function getTrackIdentity(track) {
  const info = track?.info || {};
  return {
    encoded: track?.encoded ?? track?.track ?? null,
    identifier: info.identifier ?? null,
    uri: info.uri ?? null,
  };
}

function isExpectedLavalinkTrack(track, expectedIdentity) {
  if (!expectedIdentity) {
    return true;
  }

  const candidate = getTrackIdentity(track);

  if (expectedIdentity.encoded && candidate.encoded) {
    return expectedIdentity.encoded === candidate.encoded;
  }

  if (expectedIdentity.identifier && candidate.identifier) {
    return expectedIdentity.identifier === candidate.identifier;
  }

  if (expectedIdentity.uri && candidate.uri) {
    return expectedIdentity.uri === candidate.uri;
  }

  return false;
}
