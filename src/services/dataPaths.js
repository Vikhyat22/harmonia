import path from 'path';
import fs from 'fs';

export function getDataDir() {
  const configured = process.env.DATA_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }

  // Try the local ./data directory first; fall back to /tmp on read-only filesystems (e.g. Heroku)
  const localDir = path.join(process.cwd(), 'data');
  try {
    fs.mkdirSync(localDir, { recursive: true });
    // Quick write-test to confirm it's actually writable
    fs.accessSync(localDir, fs.constants.W_OK);
    return localDir;
  } catch {
    const tmpDir = path.join('/tmp', 'harmonia-data');
    fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  }
}

export function getDataFilePath(fileName) {
  return path.join(getDataDir(), fileName);
}
