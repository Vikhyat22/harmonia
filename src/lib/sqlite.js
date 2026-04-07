import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getDataDir } from '../services/dataPaths.js';

let db = null;

export function getDb() {
  if (db) return db;

  const dataDir = getDataDir();
  // Ensure the directory exists even if getDataDir() had a silent failure
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'harmonia.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initializeSchema(db);

  return db;
}

function initializeSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      track_id TEXT,
      kind TEXT NOT NULL,
      language_name TEXT,
      title TEXT,
      artist TEXT,
      duration_ms INTEGER,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      source_type TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_history_guild ON play_history(guild_id);
    CREATE INDEX IF NOT EXISTS idx_history_requester ON play_history(requester_id);
    CREATE INDEX IF NOT EXISTS idx_history_created ON play_history(created_at);

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      track_data TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(guild_id, requester_id, track_data)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      playlist_key TEXT NOT NULL,
      playlist_name TEXT NOT NULL,
      playlist_data TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(guild_id, requester_id, playlist_key)
    );

    CREATE TABLE IF NOT EXISTS autoplay_preferences (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      seed_type TEXT DEFAULT 'history',
      mode TEXT DEFAULT 'artist-continuity',
      debug_enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      settings TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS autoplay_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      canonical_key TEXT NOT NULL,
      artist_key TEXT,
      action TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_autoplay_memory_guild_created
      ON autoplay_memory(guild_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_autoplay_memory_guild_key
      ON autoplay_memory(guild_id, canonical_key);
  `);

  ensureColumn(database, 'autoplay_preferences', 'mode', "TEXT DEFAULT 'artist-continuity'");
  ensureColumn(database, 'autoplay_preferences', 'debug_enabled', 'INTEGER DEFAULT 0');
}

function ensureColumn(database, tableName, columnName, columnDefinition) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
