import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = process.cwd();
const voiceDir = path.join(packageRoot, 'node_modules', 'discord-api-types', 'voice');
const payloadsV10Dir = path.join(
  packageRoot,
  'node_modules',
  'discord-api-types',
  'payloads',
  'v10'
);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const shimRoot = path.join(scriptDir, 'shims', 'discord-api-types');

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureFileFromShim(targetPath, sourcePath) {
  if (await exists(targetPath)) {
    return false;
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  const contents = await readFile(sourcePath, 'utf8');
  await writeFile(targetPath, contents, 'utf8');
  return true;
}

const createdJs = await ensureFileFromShim(
  path.join(voiceDir, 'v8.js'),
  path.join(shimRoot, 'voice', 'v8.js')
);

const createdMjs = await ensureFileFromShim(
  path.join(voiceDir, 'v8.mjs'),
  path.join(shimRoot, 'voice', 'v8.mjs')
);

const createdPayloadMessage = await ensureFileFromShim(
  path.join(payloadsV10Dir, 'message.js'),
  path.join(shimRoot, 'payloads', 'v10', 'message.js')
);

if (createdJs || createdMjs) {
  console.log('Applied discord-api-types voice v8 compatibility shim.');
}

if (createdPayloadMessage) {
  console.log('Applied discord-api-types payloads/v10/message compatibility shim.');
}
