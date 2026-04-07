import { createWriteStream } from 'node:fs';
import { access, chmod, copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const installDir = path.resolve(process.cwd(), process.env.PIPER_INSTALL_DIR?.trim() || 'vendor/piper');
const binaryUrl = process.env.PIPER_BINARY_URL?.trim() || '';
const binaryPath = path.resolve(process.cwd(), process.env.PIPER_PATH?.trim() || path.join('vendor', 'piper', 'piper'));
const modelDir = path.resolve(process.cwd(), process.env.PIPER_MODEL_DIR?.trim() || path.join('vendor', 'piper', 'models'));
const modelManifestRaw = process.env.PIPER_MODEL_MANIFEST?.trim() || '';

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function exists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed for ${url}: ${response.status} ${response.statusText}`);
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await pipeline(response.body, createWriteStream(destinationPath));
}

async function ensurePiperBinary() {
  if (await exists(binaryPath)) {
    console.log(`Piper binary already present at ${binaryPath}`);
    return;
  }

  if (!binaryUrl) {
    console.log('Skipping Piper binary download because PIPER_BINARY_URL is not set.');
    return;
  }

  await mkdir(installDir, { recursive: true });
  const archivePath = path.join(os.tmpdir(), `piper_${Date.now()}.tar.gz`);
  const extractDir = path.join(installDir, 'extract');

  console.log(`Downloading Piper binary from ${binaryUrl}`);
  await downloadFile(binaryUrl, archivePath);

  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });
  await runCommand('tar', ['-xzf', archivePath, '-C', extractDir]);

  const stack = [extractDir];
  let foundBinary = null;

  while (stack.length > 0 && !foundBinary) {
    const currentDir = stack.pop();
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === 'piper') {
        foundBinary = fullPath;
        break;
      }
    }
  }

  if (!foundBinary) {
    throw new Error('Downloaded Piper archive did not contain a piper binary.');
  }

  await copyFile(foundBinary, binaryPath);
  await chmod(binaryPath, 0o755);
  await rm(extractDir, { recursive: true, force: true });
  await rm(archivePath, { force: true });
  console.log(`Installed Piper binary to ${binaryPath}`);
}

function parseModelManifest() {
  if (!modelManifestRaw) {
    return {};
  }

  const parsed = JSON.parse(modelManifestRaw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

async function ensurePiperModels() {
  const manifest = parseModelManifest();
  const entries = Object.entries(manifest);

  if (entries.length === 0) {
    console.log('Skipping Piper model download because PIPER_MODEL_MANIFEST is not set.');
    return;
  }

  await mkdir(modelDir, { recursive: true });

  for (const [voiceCode, config] of entries) {
    const modelUrl = config?.modelUrl?.trim();
    const configUrl = config?.configUrl?.trim();

    if (!modelUrl || !configUrl) {
      throw new Error(`PIPER_MODEL_MANIFEST entry for ${voiceCode} must include modelUrl and configUrl.`);
    }

    const modelFileName = config.fileName?.trim() || path.basename(new URL(modelUrl).pathname);
    const configFileName = config.configFileName?.trim() || `${modelFileName}.json`;
    const modelPath = path.join(modelDir, modelFileName);
    const configPath = path.join(modelDir, configFileName);

    if (!(await exists(modelPath))) {
      console.log(`Downloading Piper model for ${voiceCode}`);
      await downloadFile(modelUrl, modelPath);
    }

    if (!(await exists(configPath))) {
      await downloadFile(configUrl, configPath);
    }
  }
}

try {
  await ensurePiperBinary();
  await ensurePiperModels();
  console.log('Piper setup complete.');
} catch (error) {
  console.error('Piper setup failed:', error);
  process.exit(1);
}
