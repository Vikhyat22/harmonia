import { getDb } from '../lib/sqlite.js';

export function recordPlayHistory(guildId, entry) {
  if (!guildId || !entry || !entry.requesterId || !entry.status || !entry.source) {
    throw new Error('recordPlayHistory requires guildId, requesterId, status, and source');
  }
  
  const db = getDb();
  
  const stmt = db.prepare(`
    INSERT INTO play_history 
    (guild_id, requester_id, kind, language_name, title, artist, duration_ms, status, source, source_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  try {
    return stmt.run(
      guildId,
      entry.requesterId,
      entry.kind === 'music' ? 'music' : 'speech',
      entry.languageName,
      entry.title,
      entry.artist || null,
      entry.durationMs || null,
      entry.status,
      entry.source,
      entry.sourceType || null
    );
  } catch (error) {
    console.error('Failed to record play history:', error);
    throw error;
  }
}

export function getGuildPlayHistory(guildId, limit = 10) {
  if (!guildId) return [];
  const db = getDb();
  
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  
  const stmt = db.prepare(`
    SELECT * FROM play_history 
    WHERE guild_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  
  try {
    return stmt.all(guildId, safeLimit);
  } catch (error) {
    console.error('Failed to get guild play history:', error);
    return [];
  }
}

export function getRecentSuccessfulTracks(guildId, limit = 20) {
  if (!guildId) return [];
  const db = getDb();
  
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  
  const stmt = db.prepare(`
    SELECT * FROM play_history 
    WHERE guild_id = ? AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT ?
  `);
  
  try {
    return stmt.all(guildId, safeLimit);
  } catch (error) {
    console.error('Failed to get recent tracks:', error);
    return [];
  }
}

export function getUserPlayHistory(requesterId, guildId, limit = 10) {
  if (!requesterId || !guildId) return [];
  const db = getDb();
  
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  
  const stmt = db.prepare(`
    SELECT * FROM play_history 
    WHERE requester_id = ? AND guild_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  
  try {
    return stmt.all(requesterId, guildId, safeLimit);
  } catch (error) {
    console.error('Failed to get user play history:', error);
    return [];
  }
}