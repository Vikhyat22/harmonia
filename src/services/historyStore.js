import { getDb } from '../lib/sqlite.js';

const MAX_HISTORY_PER_GUILD = 100;

export function recordHistory(guildId, entry) {
  const db = getDb();
  db.prepare(`
    INSERT INTO play_history (guild_id, requester_id, kind, language_name, title, artist, duration_ms, status, source, source_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    guildId,
    entry.requesterId,
    entry.languageName === 'Music' ? 'music' : 'speech',
    entry.languageName ?? null,
    entry.title ?? null,
    entry.artist ?? null,
    entry.durationMs ?? null,
    entry.status,
    entry.source ?? 'slash',
    entry.sourceType ?? null
  );
}

export function getGuildHistory(guildId, limit = 10) {
  const db = getDb();
  return db.prepare(`
    SELECT
      requester_id   AS requesterId,
      language_name  AS languageName,
      title,
      status,
      source,
      created_at     AS timestamp
    FROM play_history
    WHERE guild_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(guildId, Math.min(limit, MAX_HISTORY_PER_GUILD));
}

export function getAllGuildHistory() {
  const db = getDb();
  return db.prepare(`
    SELECT
      guild_id       AS guildId,
      requester_id   AS requesterId,
      language_name  AS languageName,
      title,
      status,
      source,
      created_at     AS timestamp
    FROM play_history
    ORDER BY created_at DESC, id DESC
  `).all();
}
