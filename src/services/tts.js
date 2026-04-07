import { promises as fs } from 'fs';
import { spawn } from 'node:child_process';
import os from 'os';
import path from 'path';
import { EdgeTTS } from 'node-edge-tts';

const EDGE_VOICE_MAP = {
  'en-US': { voice: 'en-US-AriaNeural', lang: 'en-US' },
  'en-GB': { voice: 'en-GB-SoniaNeural', lang: 'en-GB' },
  'en-AU': { voice: 'en-AU-NatashaNeural', lang: 'en-AU' },
  'en-IN': { voice: 'en-IN-NeerjaNeural', lang: 'en-IN' },
  'hi-IN': { voice: 'hi-IN-SwaraNeural', lang: 'hi-IN' },
  'bn-IN': { voice: 'bn-IN-TanishaaNeural', lang: 'bn-IN' },
  'ta-IN': { voice: 'ta-IN-PallaviNeural', lang: 'ta-IN' },
  'te-IN': { voice: 'te-IN-ShrutiNeural', lang: 'te-IN' },
  'mr-IN': { voice: 'mr-IN-AarohiNeural', lang: 'mr-IN' },
  'gu-IN': { voice: 'gu-IN-DhwaniNeural', lang: 'gu-IN' },
  'kn-IN': { voice: 'kn-IN-SapnaNeural', lang: 'kn-IN' },
  'ml-IN': { voice: 'ml-IN-SobhanaNeural', lang: 'ml-IN' },
  'es-ES': { voice: 'es-ES-AlvaroNeural', lang: 'es-ES' },
  'fr-FR': { voice: 'fr-FR-DeniseNeural', lang: 'fr-FR' },
  'de-DE': { voice: 'de-DE-KatjaNeural', lang: 'de-DE' },
  'it-IT': { voice: 'it-IT-IsabellaNeural', lang: 'it-IT' },
  'pt-BR': { voice: 'pt-BR-FranciscaNeural', lang: 'pt-BR' },
  'ru-RU': { voice: 'ru-RU-SvetlanaNeural', lang: 'ru-RU' },
  'pl-PL': { voice: 'pl-PL-ZofiaNeural', lang: 'pl-PL' },
  'nl-NL': { voice: 'nl-NL-ColetteNeural', lang: 'nl-NL' },
  'zh-CN': { voice: 'zh-CN-XiaoxiaoNeural', lang: 'zh-CN' },
  'ja-JP': { voice: 'ja-JP-NanamiNeural', lang: 'ja-JP' },
  'ko-KR': { voice: 'ko-KR-SunHiNeural', lang: 'ko-KR' },
  'th-TH': { voice: 'th-TH-PremwadeeNeural', lang: 'th-TH' },
  'vi-VN': { voice: 'vi-VN-HoaiMyNeural', lang: 'vi-VN' },
  'id-ID': { voice: 'id-ID-GadisNeural', lang: 'id-ID' },
  'ms-MY': { voice: 'ms-MY-YasminNeural', lang: 'ms-MY' },
  'fil-PH': { voice: 'fil-PH-BlessicaNeural', lang: 'fil-PH' },
  'ar-SA': { voice: 'ar-SA-ZariyahNeural', lang: 'ar-SA' },
  'fa-IR': { voice: 'fa-IR-DilaraNeural', lang: 'fa-IR' },
  'he-IL': { voice: 'he-IL-HilaNeural', lang: 'he-IL' },
  'tr-TR': { voice: 'tr-TR-EmelNeural', lang: 'tr-TR' },
  'ur-PK': { voice: 'ur-PK-UzmaNeural', lang: 'ur-PK' },
  'af-ZA': { voice: 'af-ZA-AdriNeural', lang: 'af-ZA' },
  'sw-KE': { voice: 'sw-KE-ZuriNeural', lang: 'sw-KE' },
  'zu-ZA': { voice: 'zu-ZA-ThandoNeural', lang: 'zu-ZA' }
};

const EDGE_TTS_TIMEOUT_MS = 20_000;
const EDGE_TTS_RETRY_COUNT = 1;
const SUPPORTED_PROVIDER_NAMES = new Set(['edge', 'piper', 'system']);

let cachedSayVoices = null;
let cachedSayVoicesPromise = null;

function createTempFilePath(extension = 'mp3') {
  return path.join(
    os.tmpdir(),
    `tts_${Date.now()}_${Math.random().toString(16).slice(2)}.${extension}`
  );
}

function normalizeLocaleCode(localeCode = '') {
  return localeCode.replace(/_/g, '-').toLowerCase();
}

function getBundledPiperInstallDir() {
  return path.join(process.cwd(), 'vendor', 'piper');
}

function getBundledPiperBinaryPath() {
  return path.join(getBundledPiperInstallDir(), 'piper');
}

function getBundledPiperModelDir() {
  return path.join(getBundledPiperInstallDir(), 'models');
}

export function getEdgeVoiceConfig(voiceCode) {
  return EDGE_VOICE_MAP[voiceCode] ?? null;
}

export function getDefaultTtsProviderOrder(platform = process.platform) {
  return platform === 'darwin'
    ? ['edge', 'piper', 'system']
    : ['edge', 'piper'];
}

export function getTtsProviderOrder(platform = process.platform) {
  const raw = process.env.TTS_PROVIDER_ORDER?.trim();
  if (!raw) {
    return getDefaultTtsProviderOrder(platform);
  }

  const order = raw
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider, index, list) =>
      provider && SUPPORTED_PROVIDER_NAMES.has(provider) && list.indexOf(provider) === index
    );

  return order.length > 0 ? order : getDefaultTtsProviderOrder(platform);
}

function getPiperModelMap() {
  const raw = process.env.PIPER_MODEL_MAP?.trim();
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function resolvePiperModelPath(voiceCode) {
  const modelMap = getPiperModelMap();
  if (typeof modelMap[voiceCode] === 'string' && modelMap[voiceCode].trim()) {
    return modelMap[voiceCode].trim();
  }

  const modelDir = process.env.PIPER_MODEL_DIR?.trim() || getBundledPiperModelDir();

  const candidates = [
    path.join(modelDir, `${voiceCode}.onnx`),
    path.join(modelDir, `${voiceCode.replace(/-/g, '_')}.onnx`)
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next candidate path.
    }
  }

  let entries;
  try {
    entries = await fs.readdir(modelDir);
  } catch {
    return null;
  }

  const normalizedVoiceCode = normalizeLocaleCode(voiceCode);
  const aliasPrefixes = new Set([
    voiceCode.toLowerCase(),
    voiceCode.replace(/-/g, '_').toLowerCase()
  ]);

  const fuzzyMatch = entries
    .filter((entry) => entry.endsWith('.onnx'))
    .find((entry) => {
      const lowerEntry = entry.toLowerCase();
      if ([...aliasPrefixes].some((prefix) => lowerEntry.startsWith(prefix))) {
        return true;
      }

      const normalizedEntry = normalizeLocaleCode(entry.replace(/\.onnx$/i, ''));
      return normalizedEntry.startsWith(normalizedVoiceCode);
    });

  return fuzzyMatch ? path.join(modelDir, fuzzyMatch) : null;
}

async function hasPiperConfig(modelPath) {
  try {
    await fs.access(`${modelPath}.json`);
    return true;
  } catch {
    return false;
  }
}

async function resolvePiperBinaryPath() {
  const configured = process.env.PIPER_PATH?.trim();
  if (configured) {
    return configured;
  }

  const bundled = getBundledPiperBinaryPath();
  try {
    await fs.access(bundled);
    return bundled;
  } catch {
    return 'piper';
  }
}

function preferredSystemVoiceName(voiceCode) {
  const preferences = {
    'en-US': 'Eddy (English (US))',
    'en-GB': 'Eddy (English (UK))',
    'en-AU': 'Karen',
    'en-IN': 'Aman',
    'hi-IN': 'Lekha',
    'bn-IN': 'Piya',
    'kn-IN': 'Soumya',
    'te-IN': 'Geeta',
    'es-ES': 'Eddy (Spanish (Spain))',
    'fr-FR': 'Eddy (French (France))',
    'de-DE': 'Eddy (German (Germany))',
    'it-IT': 'Eddy (Italian (Italy))',
    'pt-BR': 'Eddy (Portuguese (Brazil))',
    'ru-RU': 'Milena',
    'zh-CN': 'Eddy (Chinese (China mainland))',
    'ja-JP': 'Eddy (Japanese (Japan))',
    'ko-KR': 'Eddy (Korean (South Korea))',
    'th-TH': 'Kanya',
    'vi-VN': 'Linh',
    'id-ID': 'Damayanti',
    'ms-MY': 'Amira',
    'he-IL': 'Carmit'
  };

  return preferences[voiceCode] ?? null;
}

export function parseSayVoiceList(rawOutput) {
  return rawOutput
    .split('\n')
    .map((line) => {
      const match = line.match(/^(.*?)\s{2,}([a-z]{2}_[A-Z0-9]+)\s+#/);
      if (!match) {
        return null;
      }

      return {
        name: match[1].trim(),
        locale: match[2].trim()
      };
    })
    .filter(Boolean);
}

export function selectSystemVoice(voiceCode, voices) {
  const normalizedTarget = normalizeLocaleCode(voiceCode);
  const preferredName = preferredSystemVoiceName(voiceCode);

  if (preferredName) {
    const exactPreferred = voices.find(
      (voice) =>
        voice.name === preferredName &&
        normalizeLocaleCode(voice.locale) === normalizedTarget
    );
    if (exactPreferred) {
      return exactPreferred;
    }
  }

  const exactLocaleVoices = voices.filter(
    (voice) => normalizeLocaleCode(voice.locale) === normalizedTarget
  );
  if (exactLocaleVoices.length > 0) {
    return exactLocaleVoices[0];
  }

  const targetLanguage = normalizedTarget.split('-')[0];
  return voices.find((voice) => normalizeLocaleCode(voice.locale).startsWith(`${targetLanguage}-`)) ?? null;
}

function runCommand(command, args, input = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

async function listSystemVoices() {
  if (cachedSayVoices) {
    return cachedSayVoices;
  }

  if (!cachedSayVoicesPromise) {
    cachedSayVoicesPromise = runCommand('say', ['-v', '?'])
      .then(({ stdout }) => {
        cachedSayVoices = parseSayVoiceList(stdout);
        return cachedSayVoices;
      })
      .finally(() => {
        cachedSayVoicesPromise = null;
      });
  }

  return cachedSayVoicesPromise;
}

async function generateEdgeTtsAudio(text, voiceCode) {
  const voiceConfig = getEdgeVoiceConfig(voiceCode);
  if (!voiceConfig) {
    return { success: false, unavailable: true, error: `Language not supported by Edge: ${voiceCode}` };
  }

  let lastError = null;

  for (let attempt = 0; attempt <= EDGE_TTS_RETRY_COUNT; attempt += 1) {
    const tempFile = createTempFilePath('mp3');

    try {
      const tts = new EdgeTTS({
        ...voiceConfig,
        timeout: EDGE_TTS_TIMEOUT_MS
      });

      await tts.ttsPromise(text, tempFile);

      const stats = await fs.stat(tempFile);
      if (stats.size === 0) {
        await cleanupAudio(tempFile);
        lastError = new Error('Edge TTS returned an empty audio file.');
        continue;
      }

      return {
        success: true,
        audioPath: tempFile,
        provider: 'edge-tts',
        voice: voiceConfig.voice
      };
    } catch (error) {
      await cleanupAudio(tempFile);
      lastError = error;
      console.error('Edge TTS error:', error);
    }
  }

  return {
    success: false,
    error: lastError instanceof Error ? lastError.message : 'Edge TTS synthesis failed.'
  };
}

async function generatePiperAudio(text, voiceCode) {
  const modelPath = await resolvePiperModelPath(voiceCode);
  if (!modelPath) {
    return {
      success: false,
      unavailable: true,
      error: `No Piper model configured for ${voiceCode}`
    };
  }

  if (!(await hasPiperConfig(modelPath))) {
    return {
      success: false,
      unavailable: true,
      error: `Missing Piper model config for ${path.basename(modelPath)}`
    };
  }

  const tempFile = createTempFilePath('wav');
  const binaryPath = await resolvePiperBinaryPath();

  try {
    await runCommand(binaryPath, ['--model', modelPath, '--output_file', tempFile], text);
    const stats = await fs.stat(tempFile);
    if (stats.size === 0) {
      await cleanupAudio(tempFile);
      return { success: false, error: 'Piper returned an empty audio file.' };
    }

    return {
      success: true,
      audioPath: tempFile,
      provider: 'piper',
      voice: path.basename(modelPath)
    };
  } catch (error) {
    await cleanupAudio(tempFile);
    return {
      success: false,
      unavailable: error instanceof Error && /ENOENT/.test(error.message),
      error: error instanceof Error ? error.message : 'Piper synthesis failed.'
    };
  }
}

async function generateSystemTtsAudio(text, voiceCode) {
  if (process.platform !== 'darwin') {
    return {
      success: false,
      unavailable: true,
      error: 'System speech fallback is only available on macOS.'
    };
  }

  let voices;
  try {
    voices = await listSystemVoices();
  } catch (error) {
    return {
      success: false,
      unavailable: true,
      error: error instanceof Error ? error.message : 'Unable to list system voices.'
    };
  }

  const voice = selectSystemVoice(voiceCode, voices);
  if (!voice) {
    return {
      success: false,
      unavailable: true,
      error: `No system voice available for ${voiceCode}`
    };
  }

  const tempAiffFile = createTempFilePath('aiff');
  const tempFile = createTempFilePath('wav');

  try {
    await runCommand('say', ['-v', voice.name, '-o', tempAiffFile], text);
    await runCommand(
      'afconvert',
      ['-f', 'WAVE', '-d', 'LEI16@22050', tempAiffFile, tempFile]
    );

    const stats = await fs.stat(tempFile);
    if (stats.size === 0) {
      await cleanupAudio(tempAiffFile);
      await cleanupAudio(tempFile);
      return { success: false, error: 'System speech returned an empty audio file.' };
    }

    await cleanupAudio(tempAiffFile);

    return {
      success: true,
      audioPath: tempFile,
      provider: 'system-say',
      voice: voice.name
    };
  } catch (error) {
    await cleanupAudio(tempAiffFile);
    await cleanupAudio(tempFile);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'System speech synthesis failed.'
    };
  }
}

export async function generateTTS(text, voiceCode, options = {}) {
  if (!text || text.trim() === '') {
    return { success: false, error: 'Text is required' };
  }

  const providerOrder = options.providerOrder ?? getTtsProviderOrder();
  const providerFns = {
    edge: generateEdgeTtsAudio,
    piper: generatePiperAudio,
    system: generateSystemTtsAudio,
    ...(options.providerFns ?? {})
  };

  const failures = [];
  const unavailable = [];

  for (const providerName of providerOrder) {
    const providerFn = providerFns[providerName];
    if (!providerFn) {
      continue;
    }

    const result = await providerFn(text, voiceCode, options);
    if (result?.success) {
      return result;
    }

    const errorMessage = result?.error ?? `${providerName} synthesis failed.`;
    if (result?.unavailable) {
      unavailable.push(`${providerName}: ${errorMessage}`);
    } else {
      failures.push(`${providerName}: ${errorMessage}`);
    }
  }

  if (failures.length > 0) {
    return {
      success: false,
      error: `All TTS providers failed. ${failures.join(' | ')}`
    };
  }

  if (unavailable.length > 0) {
    return {
      success: false,
      error: `No available TTS provider is configured. ${unavailable.join(' | ')}`
    };
  }

  return {
    success: false,
    error: 'No TTS providers are configured.'
  };
}

export async function cleanupAudio(filePath) {
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore cleanup errors
  }
}
