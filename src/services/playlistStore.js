import { getDb } from '../lib/sqlite.js';
import { normalizeFavoriteTrack } from './musicCatalog.js';

export const MAX_SAVED_PLAYLIST_TRACKS = 50;

export function normalizePlaylistName(name) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPlaylistKey(name) {
  return normalizePlaylistName(name).toLowerCase();
}

function normalizePlaylistTracks(tracks) {
  return (Array.isArray(tracks) ? tracks : [])
    .map((track) => normalizeFavoriteTrack(track))
    .filter(Boolean)
    .slice(0, MAX_SAVED_PLAYLIST_TRACKS);
}

function deserializePlaylistRow(row) {
  if (!row) {
    return null;
  }

  try {
    const tracks = JSON.parse(row.playlist_data);
    return {
      name: row.playlist_name,
      key: row.playlist_key,
      tracks: normalizePlaylistTracks(tracks),
      trackCount: normalizePlaylistTracks(tracks).length,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } catch (error) {
    console.error('Failed to parse playlist row:', error);
    return null;
  }
}

export function savePlaylist(guildId, requesterId, name, tracks) {
  const normalizedName = normalizePlaylistName(name);
  const playlistKey = getPlaylistKey(normalizedName);
  const normalizedTracks = normalizePlaylistTracks(tracks);

  if (!guildId || !requesterId || !normalizedName) {
    throw new Error('savePlaylist requires guildId, requesterId, and a playlist name');
  }

  if (normalizedTracks.length === 0) {
    throw new Error('savePlaylist requires at least one replayable music track');
  }

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO playlists (
      guild_id, requester_id, playlist_key, playlist_name, playlist_data, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    )
    ON CONFLICT(guild_id, requester_id, playlist_key) DO UPDATE SET
      playlist_name = excluded.playlist_name,
      playlist_data = excluded.playlist_data,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    guildId,
    requesterId,
    playlistKey,
    normalizedName,
    JSON.stringify(normalizedTracks)
  );

  return {
    name: normalizedName,
    key: playlistKey,
    tracks: normalizedTracks,
    trackCount: normalizedTracks.length
  };
}

export function appendTracksToPlaylist(guildId, requesterId, name, tracks, options = {}) {
  const normalizedName = normalizePlaylistName(name);
  if (!guildId || !requesterId || !normalizedName) {
    throw new Error('appendTracksToPlaylist requires guildId, requesterId, and a playlist name');
  }

  const normalizedTracks = normalizePlaylistTracks(tracks);
  if (normalizedTracks.length === 0) {
    throw new Error('appendTracksToPlaylist requires at least one replayable music track');
  }

  const existing = getPlaylist(guildId, requesterId, normalizedName);
  if (!existing) {
    if (options.createIfMissing) {
      const created = savePlaylist(guildId, requesterId, normalizedName, normalizedTracks);
      return {
        ...created,
        addedCount: created.trackCount,
        created: true,
        truncated: false
      };
    }

    return {
      updated: false,
      reason: 'missing'
    };
  }

  const combinedTracks = [...existing.tracks, ...normalizedTracks];
  const limitedTracks = combinedTracks.slice(0, MAX_SAVED_PLAYLIST_TRACKS);
  const addedCount = Math.max(0, limitedTracks.length - existing.tracks.length);
  const updated = savePlaylist(guildId, requesterId, existing.name, limitedTracks);

  return {
    ...updated,
    updated: true,
    addedCount,
    created: false,
    truncated: combinedTracks.length > limitedTracks.length
  };
}

export function getPlaylists(guildId, requesterId) {
  if (!guildId || !requesterId) {
    return [];
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT playlist_key, playlist_name, playlist_data, created_at, updated_at
    FROM playlists
    WHERE guild_id = ? AND requester_id = ?
    ORDER BY updated_at DESC, playlist_name ASC
  `).all(guildId, requesterId);

  return rows.map(deserializePlaylistRow).filter(Boolean);
}

export function getPlaylist(guildId, requesterId, name) {
  const playlistKey = getPlaylistKey(name);
  if (!guildId || !requesterId || !playlistKey) {
    return null;
  }

  const db = getDb();
  const row = db.prepare(`
    SELECT playlist_key, playlist_name, playlist_data, created_at, updated_at
    FROM playlists
    WHERE guild_id = ? AND requester_id = ? AND playlist_key = ?
    LIMIT 1
  `).get(guildId, requesterId, playlistKey);

  return deserializePlaylistRow(row);
}

export function renamePlaylist(guildId, requesterId, fromName, toName) {
  const fromKey = getPlaylistKey(fromName);
  const toNormalizedName = normalizePlaylistName(toName);
  const toKey = getPlaylistKey(toNormalizedName);

  if (!guildId || !requesterId || !fromKey || !toKey) {
    return {
      renamed: false,
      reason: 'invalid'
    };
  }

  const existing = getPlaylist(guildId, requesterId, fromName);
  if (!existing) {
    return {
      renamed: false,
      reason: 'missing'
    };
  }

  if (fromKey !== toKey && getPlaylist(guildId, requesterId, toNormalizedName)) {
    return {
      renamed: false,
      reason: 'target-exists'
    };
  }

  const db = getDb();
  db.prepare(`
    UPDATE playlists
    SET playlist_key = ?, playlist_name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE guild_id = ? AND requester_id = ? AND playlist_key = ?
  `).run(toKey, toNormalizedName, guildId, requesterId, fromKey);

  return {
    renamed: true,
    fromName: existing.name,
    toName: toNormalizedName
  };
}

export function removePlaylistTrackAtPosition(guildId, requesterId, name, position) {
  if (!Number.isInteger(position) || position < 1) {
    return {
      removed: false,
      reason: 'out-of-range'
    };
  }

  const playlist = getPlaylist(guildId, requesterId, name);
  if (!playlist) {
    return {
      removed: false,
      reason: 'missing'
    };
  }

  if (position > playlist.tracks.length) {
    return {
      removed: false,
      reason: 'out-of-range',
      playlist
    };
  }

  const nextTracks = [...playlist.tracks];
  const [removedTrack] = nextTracks.splice(position - 1, 1);

  if (nextTracks.length === 0) {
    deletePlaylist(guildId, requesterId, playlist.name);
    return {
      removed: true,
      deletedPlaylist: true,
      playlistName: playlist.name,
      position,
      track: removedTrack
    };
  }

  const updated = savePlaylist(guildId, requesterId, playlist.name, nextTracks);
  return {
    removed: true,
    deletedPlaylist: false,
    playlistName: updated.name,
    position,
    track: removedTrack,
    trackCount: updated.trackCount
  };
}

export function deletePlaylist(guildId, requesterId, name) {
  const playlistKey = getPlaylistKey(name);
  if (!guildId || !requesterId || !playlistKey) {
    return false;
  }

  const db = getDb();
  const result = db.prepare(`
    DELETE FROM playlists
    WHERE guild_id = ? AND requester_id = ? AND playlist_key = ?
  `).run(guildId, requesterId, playlistKey);

  return result.changes > 0;
}
