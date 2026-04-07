import { getDb } from '../lib/sqlite.js';
import { buildCanonicalKey, normalizeArtist } from './recommendationIdentity.js';

const AUTOPLAY_MEMORY_ACTIONS = new Set(['played', 'skipped', 'failed']);
const AUTOPLAY_MEMORY_SOURCES = new Set(['manual', 'autoplay']);

function normalizeLimit(limit, fallback = 50) {
  return Math.max(1, Math.min(Number(limit) || fallback, 200));
}

function normalizeMemoryAction(value) {
  return AUTOPLAY_MEMORY_ACTIONS.has(value) ? value : null;
}

function normalizeMemorySource(value) {
  return AUTOPLAY_MEMORY_SOURCES.has(value) ? value : 'manual';
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

export function recordAutoplayMemory(guildId, { track, action, source = 'manual' }) {
  const normalizedAction = normalizeMemoryAction(action);
  if (!guildId || !track || !normalizedAction) {
    return false;
  }

  const canonicalKey = buildCanonicalKey(track);
  if (!canonicalKey) {
    return false;
  }

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO autoplay_memory (guild_id, canonical_key, artist_key, action, source)
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(
      guildId,
      canonicalKey,
      normalizeArtist(track.artist) || null,
      normalizedAction,
      normalizeMemorySource(source)
    );
    return true;
  } catch (error) {
    console.error('Failed to record autoplay memory:', error);
    return false;
  }
}

export function getAutoplayMemoryEntries(guildId, limit = 50) {
  if (!guildId) {
    return [];
  }

  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      canonical_key AS canonicalKey,
      artist_key AS artistKey,
      action,
      source,
      created_at AS createdAt
    FROM autoplay_memory
    WHERE guild_id = ?
    ORDER BY id DESC
    LIMIT ?
  `);

  try {
    return stmt.all(guildId, normalizeLimit(limit));
  } catch (error) {
    console.error('Failed to load autoplay memory:', error);
    return [];
  }
}

export function getAutoplayMemorySnapshot(guildId, limit = 50) {
  const entries = getAutoplayMemoryEntries(guildId, limit);
  const chronologicalEntries = [...entries].reverse();
  const recentCanonicalKeys = uniqueValues(entries.map((entry) => entry.canonicalKey));
  const skippedCanonicalKeys = uniqueValues(
    entries
      .filter((entry) => entry.action === 'skipped')
      .map((entry) => entry.canonicalKey)
  );
  const failedCanonicalKeys = uniqueValues(
    entries
      .filter((entry) => entry.action === 'failed')
      .map((entry) => entry.canonicalKey)
  );
  const recentArtistKeys = uniqueValues(entries.map((entry) => entry.artistKey));
  const recentAutoplayArtistKeys = chronologicalEntries
    .filter((entry) => entry.source === 'autoplay' && entry.action !== 'failed')
    .map((entry) => entry.artistKey)
    .filter(Boolean)
    .slice(-20);

  return {
    entries,
    recentCanonicalKeys,
    skippedCanonicalKeys,
    failedCanonicalKeys,
    recentArtistKeys,
    recentAutoplayArtistKeys,
  };
}
