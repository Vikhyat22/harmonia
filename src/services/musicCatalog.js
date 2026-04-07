// src/services/musicCatalog.js
import { getDb } from '../lib/sqlite.js';

export const DEFAULT_AUTOPLAY_MODE = 'artist-continuity';
export const AUTOPLAY_MODES = [
  'strict-original',
  'artist-continuity',
  'discovery',
  'radio'
];

function defaultAutoplayPreference() {
  return {
    enabled: false,
    seedType: 'history',
    seed_type: 'history',
    mode: DEFAULT_AUTOPLAY_MODE,
    debugEnabled: false,
    debug_enabled: false
  };
}

function normalizeAutoplayMode(value) {
  return AUTOPLAY_MODES.includes(value) ? value : DEFAULT_AUTOPLAY_MODE;
}

function normalizeAutoplayPreferenceRow(row) {
  if (!row) {
    return defaultAutoplayPreference();
  }

  const seedType = row.seed_type ?? 'history';
  const mode = normalizeAutoplayMode(row.mode);
  const debugEnabled = Boolean(row.debug_enabled);

  return {
    enabled: Boolean(row.enabled),
    seedType,
    seed_type: seedType,
    mode,
    debugEnabled,
    debug_enabled: debugEnabled
  };
}

export function normalizeFavoriteTrack(track) {
  if (!track) {
    return null;
  }

  const title = track.title ?? null;
  const artist = track.artist ?? 'Unknown Artist';
  const durationMs = track.durationMs ?? null;
  const sourceType = track.sourceType ?? 'direct-url';
  const playbackUrl = track.playbackUrl
    ?? track.playbackInput
    ?? track.sourceUrl
    ?? null;
  const canonicalUrl = track.canonicalUrl
    ?? track.metadata?.canonicalUrl
    ?? null;
  const spotifyUri = track.spotifyUri
    ?? track.metadata?.spotifyUri
    ?? null;
  const requestQuery = track.requestQuery
    ?? canonicalUrl
    ?? spotifyUri
    ?? playbackUrl
    ?? [title, artist].filter(Boolean).join(' ').trim()
    ?? null;
  const thumbnailUrl = track.thumbnailUrl
    ?? track.metadata?.thumbnailUrl
    ?? track.metadata?.artworkUrl
    ?? null;

  if (!title || !requestQuery) {
    return null;
  }

  return {
    title,
    artist,
    durationMs,
    sourceType,
    requestQuery,
    playbackUrl,
    canonicalUrl,
    spotifyUri,
    thumbnailUrl
  };
}

function serializeFavoriteTrack(track) {
  const normalized = normalizeFavoriteTrack(track);
  if (!normalized) {
    return null;
  }

  return JSON.stringify(normalized);
}

export function addFavorite(guildId, requesterId, track) {
  if (!guildId || !requesterId || !track) {
    throw new Error('addFavorite requires guildId, requesterId, and track');
  }

  const trackData = serializeFavoriteTrack(track);
  if (!trackData) {
    throw new Error('addFavorite requires a replayable music track');
  }
  
  const db = getDb();
  
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO favorites (guild_id, requester_id, track_data)
    VALUES (?, ?, ?)
  `);
  
  try {
    stmt.run(guildId, requesterId, trackData);
    return true;
  } catch (error) {
    console.error('Failed to add favorite:', error);
    return false;
  }
}

export function hasFavorite(guildId, requesterId, track) {
  if (!guildId || !requesterId || !track) {
    return false;
  }

  const trackData = typeof track === 'string' ? track : serializeFavoriteTrack(track);
  if (!trackData) {
    return false;
  }

  const db = getDb();
  const stmt = db.prepare(`
    SELECT 1 FROM favorites
    WHERE guild_id = ? AND requester_id = ? AND track_data = ?
    LIMIT 1
  `);

  try {
    return Boolean(stmt.get(guildId, requesterId, trackData));
  } catch (error) {
    console.error('Failed to check favorite:', error);
    return false;
  }
}

export function removeFavorite(guildId, requesterId, trackOrData) {
  if (!guildId || !requesterId || !trackOrData) {
    return false;
  }

  const trackData = typeof trackOrData === 'string'
    ? trackOrData
    : serializeFavoriteTrack(trackOrData);
  if (!trackData) {
    return false;
  }
  
  const db = getDb();
  
  const stmt = db.prepare(`
    DELETE FROM favorites 
    WHERE guild_id = ? AND requester_id = ? AND track_data = ?
  `);
  
  try {
    const result = stmt.run(guildId, requesterId, trackData);
    return result.changes > 0;
  } catch (error) {
    console.error('Failed to remove favorite:', error);
    return false;
  }
}

export function getFavorites(guildId, requesterId) {
  if (!guildId || !requesterId) {
    return [];
  }
  
  const db = getDb();
  
  const stmt = db.prepare(`
    SELECT track_data, created_at FROM favorites
    WHERE guild_id = ? AND requester_id = ?
    ORDER BY created_at DESC
  `);
  
  try {
    const rows = stmt.all(guildId, requesterId);
    return rows
      .map((row) => {
        const favorite = normalizeFavoriteTrack(JSON.parse(row.track_data));
        return favorite
          ? {
              ...favorite,
              favoritedAt: row.created_at
            }
          : null;
      })
      .filter(Boolean);
  } catch (error) {
    console.error('Failed to get favorites:', error);
    return [];
  }
}

export function getFavoriteAtPosition(guildId, requesterId, position) {
  if (!Number.isInteger(position) || position < 1) {
    return null;
  }

  const favorites = getFavorites(guildId, requesterId);
  return favorites[position - 1] ?? null;
}

export function removeFavoriteAtPosition(guildId, requesterId, position) {
  const favorite = getFavoriteAtPosition(guildId, requesterId, position);
  if (!favorite) {
    return null;
  }

  return removeFavorite(guildId, requesterId, favorite) ? favorite : null;
}

export function getAutoplayPreference(guildId) {
  if (!guildId) {
    return defaultAutoplayPreference();
  }
  
  const db = getDb();
  
  const stmt = db.prepare(`
    SELECT enabled, seed_type, mode, debug_enabled FROM autoplay_preferences WHERE guild_id = ?
  `);
  
  try {
    return normalizeAutoplayPreferenceRow(stmt.get(guildId));
  } catch (error) {
    console.error('Failed to get autoplay preference:', error);
    return defaultAutoplayPreference();
  }
}

export function setAutoplayPreference(guildId, enabledOrPreference, seedType = 'history') {
  if (!guildId) {
    return false;
  }
  
  const db = getDb();
  const current = getAutoplayPreference(guildId);

  let nextPreference;
  if (typeof enabledOrPreference === 'object' && enabledOrPreference !== null) {
    const nextSeedType = enabledOrPreference.seedType
      ?? enabledOrPreference.seed_type
      ?? current.seedType;
    const nextDebugEnabled = enabledOrPreference.debugEnabled
      ?? enabledOrPreference.debug_enabled
      ?? current.debugEnabled;

    nextPreference = {
      enabled: enabledOrPreference.enabled ?? current.enabled,
      seedType: nextSeedType,
      mode: normalizeAutoplayMode(enabledOrPreference.mode ?? current.mode),
      debugEnabled: Boolean(nextDebugEnabled)
    };
  } else {
    nextPreference = {
      enabled: Boolean(enabledOrPreference),
      seedType,
      mode: current.mode,
      debugEnabled: current.debugEnabled
    };
  }
  
  const stmt = db.prepare(`
    INSERT INTO autoplay_preferences (guild_id, enabled, seed_type, mode, debug_enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    ON CONFLICT(guild_id) DO UPDATE SET
      enabled = excluded.enabled,
      seed_type = excluded.seed_type,
      mode = excluded.mode,
      debug_enabled = excluded.debug_enabled,
      updated_at = excluded.updated_at
  `);
  
  try {
    stmt.run(
      guildId,
      nextPreference.enabled ? 1 : 0,
      nextPreference.seedType,
      nextPreference.mode,
      nextPreference.debugEnabled ? 1 : 0
    );
    return true;
  } catch (error) {
    console.error('Failed to set autoplay preference:', error);
    return false;
  }
}
