import { promises as fs } from 'fs';
import { getDataDir, getDataFilePath } from './dataPaths.js';

const DATA_DIR = getDataDir();
const SETTINGS_PATH = getDataFilePath('user-settings.json');

export const DEFAULT_USER_SETTINGS = Object.freeze({
  defaultLanguage: null
});

let cache = null;
let writeChain = Promise.resolve();

async function ensureStoreFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(SETTINGS_PATH);
  } catch {
    await fs.writeFile(SETTINGS_PATH, '{}', 'utf8');
  }
}

async function loadStore() {
  if (cache) return cache;

  await ensureStoreFile();
  const raw = await fs.readFile(SETTINGS_PATH, 'utf8');
  cache = JSON.parse(raw || '{}');
  return cache;
}

async function saveStore(store) {
  cache = store;
  writeChain = writeChain.then(() =>
    fs.writeFile(SETTINGS_PATH, JSON.stringify(store, null, 2), 'utf8')
  );
  await writeChain;
}

export async function getUserSettings(userId) {
  const store = await loadStore();
  const userSettings = userId ? store[userId] ?? {} : {};

  return {
    ...DEFAULT_USER_SETTINGS,
    ...userSettings
  };
}

export async function updateUserSettings(userId, patch) {
  const store = await loadStore();
  const current = {
    ...DEFAULT_USER_SETTINGS,
    ...(store[userId] ?? {})
  };

  const next = {
    ...current,
    ...patch
  };

  store[userId] = next;
  await saveStore(store);
  return next;
}

export async function clearUserDefaultLanguage(userId) {
  return updateUserSettings(userId, { defaultLanguage: null });
}
