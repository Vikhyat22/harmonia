import { getDb } from '../lib/sqlite.js';
import { DEFAULT_IDLE_DISCONNECT_MS } from './voice.js';

export const DEFAULT_GUILD_SETTINGS = Object.freeze({
  defaultLanguage: null,
  idleDisconnectMs: DEFAULT_IDLE_DISCONNECT_MS,
  stayConnected: false,
  chunkLength: 280,
  adminRoleId: null,
  djRoleId: null,
  accessMode: 'open',
  allowedUserIds: [],
  allowedRoleIds: [],
  autoTtsChannelIds: [],
  musicRequestChannelId: null,
  musicControllerMessageId: null,
  blockedWords: [],
  blockedUserIds: [],
  blockedRoleIds: []
});

// In-memory cache: guildId -> merged settings object
const cache = new Map();

function readRow(guildId) {
  const db = getDb();
  const row = db.prepare('SELECT settings FROM guild_settings WHERE guild_id = ?').get(guildId);
  if (!row) return {};
  try {
    return JSON.parse(row.settings);
  } catch {
    return {};
  }
}

function writeRow(guildId, settings) {
  const db = getDb();
  db.prepare(`
    INSERT INTO guild_settings (guild_id, settings, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    ON CONFLICT(guild_id) DO UPDATE SET
      settings   = excluded.settings,
      updated_at = excluded.updated_at
  `).run(guildId, JSON.stringify(settings));
}

export async function getGuildSettings(guildId) {
  if (cache.has(guildId)) {
    return cache.get(guildId);
  }
  const stored = readRow(guildId);
  const merged = { ...DEFAULT_GUILD_SETTINGS, ...stored };
  cache.set(guildId, merged);
  return merged;
}

export async function getAllGuildSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT guild_id, settings FROM guild_settings').all();
  return rows.map(({ guild_id, settings }) => {
    let stored = {};
    try { stored = JSON.parse(settings); } catch { /* ignore */ }
    return { guildId: guild_id, ...DEFAULT_GUILD_SETTINGS, ...stored };
  });
}

export async function updateGuildSettings(guildId, patch) {
  const current = await getGuildSettings(guildId);
  const next = { ...current, ...patch };
  writeRow(guildId, next);
  cache.set(guildId, next);
  return next;
}

export function getVoiceSessionOptions(settings = DEFAULT_GUILD_SETTINGS) {
  return {
    idleDisconnectMs: settings.idleDisconnectMs,
    stayConnected: Boolean(settings.stayConnected)
  };
}

export async function clearDefaultLanguage(guildId) {
  return updateGuildSettings(guildId, { defaultLanguage: null });
}

export async function resetGuildSettings(guildId) {
  const db = getDb();
  db.prepare('DELETE FROM guild_settings WHERE guild_id = ?').run(guildId);
  cache.delete(guildId);
  return { ...DEFAULT_GUILD_SETTINGS };
}
