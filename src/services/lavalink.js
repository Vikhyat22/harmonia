import { LavalinkManager } from 'lavalink-client';

function getNodeOptions() {
  const authorization = process.env.LAVALINK_AUTH || process.env.LAVALINK_PASSWORD || 'youshallnotpass';
  const secure = process.env.LAVALINK_SECURE === 'true';
  const nodeName = process.env.LAVALINK_NAME || 'Lavalink_Node';

  const hostStrings = process.env.LAVALINK_HOSTS
    ? process.env.LAVALINK_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
    : [`${process.env.LAVALINK_HOST || 'localhost'}:${process.env.LAVALINK_PORT || '2333'}`];

  return hostStrings.map((hostString) => {
    let ip = hostString;
    let port = 2333;

    try {
      const url = new URL(hostString.includes('://') ? hostString : `http://${hostString}`);
      ip = url.hostname;
      port = Number(url.port) || 2333;
    } catch {
      const parts = hostString.split(':');
      ip = parts[0];
      port = Number(parts[1]) || 2333;
    }

    return {
      id: `${nodeName}_${ip.replace(/\./g, '_')}`,
      host: ip,
      port,
      authorization,
      secure,
    };
  });
}

let manager = null;

/**
 * Creates and stores the LavalinkManager. Must be called after client.login() but
 * before the clientReady event fires (or at least before activateLavalink).
 */
export function setupLavalink(client) {
  if (manager) return manager;

  const nodes = getNodeOptions();
  console.log(`[LavalinkManager] Initializing with ${nodes.length} node(s):`, JSON.stringify(nodes, null, 2));

  manager = new LavalinkManager({
    nodes,
    sendToShard: (guildId, payload) => {
      client.guilds.cache.get(guildId)?.shard?.send(payload);
    },
    client: {
      id: process.env.CLIENT_ID ?? client.user?.id ?? 'unknown',
      username: 'Harmonia',
    },
    autoSkip: false,
    playerOptions: {
      onDisconnect: {
        autoReconnect: true,
        destroyPlayer: false,
      },
    },
  });

  manager.nodeManager.on('connect', (node) => {
    console.log(`✅ Lavalink node ${node.id} connected!`);
  });

  manager.nodeManager.on('error', (node, error) => {
    console.error(`❌ Lavalink node ${node.id} error:`, error?.message ?? error);
  });

  manager.nodeManager.on('disconnect', (node, reason) => {
    console.warn(`⚠️ Lavalink node ${node.id} disconnected: ${reason}`);
  });

  // Forward raw Discord gateway events to lavalink-client
  client.on('raw', (d) => {
    manager?.sendRawData(d);
  });

  return manager;
}

/**
 * Activates the LavalinkManager by calling init(). Must be called inside the
 * clientReady event after the bot user is available.
 */
export async function activateLavalink(clientUser) {
  if (!manager) throw new Error('LavalinkManager has not been set up yet. Call setupLavalink first.');
  await manager.init({ id: clientUser.id, username: clientUser.username, shards: 'auto' });
  console.log('🎵 LavalinkManager activated, connected to Lavalink server.');
}

export function getLavalinkManager() {
  if (!manager) throw new Error('LavalinkManager has not been initialized yet.');
  return manager;
}

export function getAvailableNode() {
  if (!manager) return null;
  try {
    const nodes = manager.nodeManager.leastUsedNodes();
    return nodes.length > 0 ? nodes[0] : null;
  } catch {
    return null;
  }
}

export async function getOrCreatePlayer(guildId, voiceChannelId) {
  const mgr = getLavalinkManager();
  const existing = mgr.getPlayer(guildId);
  if (existing) return existing;

  const player = mgr.createPlayer({ guildId, voiceChannelId, selfDeaf: true });
  await player.connect();
  return player;
}

export async function playTrack(guildId, track, options = {}) {
  const player = getLavalinkManager().getPlayer(guildId);
  if (!player) throw new Error('Not connected to a voice channel');

  await player.queue.add(track);
  if (!player.playing) await player.play({ paused: false });
  return player;
}

export async function stopPlayback(guildId) {
  const player = getLavalinkManager().getPlayer(guildId);
  if (!player) return false;
  try {
    player.stopPlaying(false, false);
    return true;
  } catch {
    return false;
  }
}

export async function pausePlayback(guildId, pause = true) {
  const player = getLavalinkManager().getPlayer(guildId);
  if (!player) return false;
  try {
    if (pause) {
      player.pause();
    } else {
      player.resume();
    }
    return true;
  } catch {
    return false;
  }
}

export async function seekTrack(guildId, position) {
  const player = getLavalinkManager().getPlayer(guildId);
  if (!player) return false;
  try {
    await player.seek(position);
    return true;
  } catch {
    return false;
  }
}

export async function setVolume(guildId, volume) {
  const player = getLavalinkManager().getPlayer(guildId);
  if (!player) return false;
  try {
    await player.setVolume(volume, true);
    return true;
  } catch {
    return false;
  }
}

export async function disconnectVoice(guildId) {
  const player = getLavalinkManager().getPlayer(guildId);
  if (!player) return false;
  try {
    await player.destroy();
    return true;
  } catch {
    return false;
  }
}

export function getPlayerState(guildId) {
  const player = getLavalinkManager().getPlayer(guildId);
  if (!player) return null;

  return {
    position: player.position || 0,
    isPaused: player.paused === true,
    isPlaying: player.playing === true,
    loop: player.repeatMode || 'off',
  };
}

export async function shutdownLavalink() {
  if (!manager) return;

  for (const [guildId] of [...manager.players]) {
    await disconnectVoice(guildId).catch(() => {});
  }

  manager = null;
}

// Aliases for backwards compatibility
export const destroyLavalink = shutdownLavalink;
export const initShoukaku = setupLavalink;
export const shutdownShoukaku = shutdownLavalink;
export function getShoukaku() { return manager; }
