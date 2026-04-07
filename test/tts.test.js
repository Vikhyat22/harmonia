import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import {
  generateTTS,
  getDefaultTtsProviderOrder,
  getEdgeVoiceConfig,
  getTtsProviderOrder,
  parseSayVoiceList,
  resolvePiperModelPath,
  selectSystemVoice
} from '../src/services/tts.js';

test('Edge voice mapping returns a concrete voice for supported locales', () => {
  assert.deepEqual(getEdgeVoiceConfig('en-US'), {
    voice: 'en-US-AriaNeural',
    lang: 'en-US'
  });

  assert.deepEqual(getEdgeVoiceConfig('hi-IN'), {
    voice: 'hi-IN-SwaraNeural',
    lang: 'hi-IN'
  });
});

test('Edge voice mapping rejects unsupported locales cleanly', () => {
  assert.equal(getEdgeVoiceConfig('xx-XX'), null);
  assert.equal(getEdgeVoiceConfig('pa-IN'), null);
  assert.equal(getEdgeVoiceConfig('yo-NG'), null);
});

test('provider order defaults to edge first with render-safe fallbacks after it', () => {
  const previous = process.env.TTS_PROVIDER_ORDER;
  delete process.env.TTS_PROVIDER_ORDER;

  assert.deepEqual(getTtsProviderOrder('linux'), ['edge', 'piper']);
  assert.deepEqual(getTtsProviderOrder('darwin'), ['edge', 'piper', 'system']);

  if (previous === undefined) {
    delete process.env.TTS_PROVIDER_ORDER;
  } else {
    process.env.TTS_PROVIDER_ORDER = previous;
  }
});

test('resolvePiperModelPath discovers standard Piper model filenames in the model directory', async () => {
  const previousMap = process.env.PIPER_MODEL_MAP;
  const previousDir = process.env.PIPER_MODEL_DIR;
  const tempDir = path.join(os.tmpdir(), `piper-models-${Date.now()}`);

  await mkdir(tempDir, { recursive: true });
  await writeFile(path.join(tempDir, 'en_US-lessac-medium.onnx'), 'fake');

  delete process.env.PIPER_MODEL_MAP;
  process.env.PIPER_MODEL_DIR = tempDir;

  const resolved = await resolvePiperModelPath('en-US');
  assert.equal(resolved, path.join(tempDir, 'en_US-lessac-medium.onnx'));

  await rm(tempDir, { recursive: true, force: true });

  if (previousMap === undefined) {
    delete process.env.PIPER_MODEL_MAP;
  } else {
    process.env.PIPER_MODEL_MAP = previousMap;
  }

  if (previousDir === undefined) {
    delete process.env.PIPER_MODEL_DIR;
  } else {
    process.env.PIPER_MODEL_DIR = previousDir;
  }
});

test('default provider order keeps system fallback only on macOS', () => {
  assert.deepEqual(getDefaultTtsProviderOrder('linux'), ['edge', 'piper']);
  assert.deepEqual(getDefaultTtsProviderOrder('darwin'), ['edge', 'piper', 'system']);
});

test('generateTTS falls back to the next provider when edge fails', async () => {
  const calls = [];

  const result = await generateTTS('hello', 'en-US', {
    providerOrder: ['edge', 'system'],
    providerFns: {
      async edge() {
        calls.push('edge');
        return { success: false, error: 'rate limited' };
      },
      async system() {
        calls.push('system');
        return {
          success: true,
          audioPath: '/tmp/fake.wav',
          provider: 'system-say',
          voice: 'Eddy (English (US))'
        };
      }
    }
  });

  assert.deepEqual(calls, ['edge', 'system']);
  assert.equal(result.success, true);
  assert.equal(result.provider, 'system-say');
});

test('generateTTS surfaces a clean error when only unavailable providers exist', async () => {
  const result = await generateTTS('hello', 'en-US', {
    providerOrder: ['piper', 'system'],
    providerFns: {
      async piper() {
        return { success: false, unavailable: true, error: 'not configured' };
      },
      async system() {
        return { success: false, unavailable: true, error: 'not supported' };
      }
    }
  });

  assert.equal(result.success, false);
  assert.match(result.error, /No available TTS provider is configured/);
});

test('parseSayVoiceList extracts system voices from say output', () => {
  const voices = parseSayVoiceList([
    'Eddy (English (US))  en_US    # Hello!',
    'Lekha               hi_IN    # नमस्ते!'
  ].join('\n'));

  assert.deepEqual(voices, [
    { name: 'Eddy (English (US))', locale: 'en_US' },
    { name: 'Lekha', locale: 'hi_IN' }
  ]);
});

test('selectSystemVoice prefers exact locale matches and falls back by language', () => {
  const voices = [
    { name: 'Eddy (English (US))', locale: 'en_US' },
    { name: 'Lekha', locale: 'hi_IN' },
    { name: 'Majed', locale: 'ar_001' }
  ];

  assert.deepEqual(selectSystemVoice('en-US', voices), voices[0]);
  assert.deepEqual(selectSystemVoice('hi-IN', voices), voices[1]);
  assert.deepEqual(selectSystemVoice('ar-SA', voices), voices[2]);
});

test('resolvePiperModelPath prefers explicit mapping over directory discovery', async () => {
  const previousMap = process.env.PIPER_MODEL_MAP;
  const previousDir = process.env.PIPER_MODEL_DIR;

  process.env.PIPER_MODEL_MAP = JSON.stringify({ 'en-US': '/tmp/piper/en-us.onnx' });
  delete process.env.PIPER_MODEL_DIR;

  const resolved = await resolvePiperModelPath('en-US');
  assert.equal(resolved, '/tmp/piper/en-us.onnx');

  if (previousMap === undefined) {
    delete process.env.PIPER_MODEL_MAP;
  } else {
    process.env.PIPER_MODEL_MAP = previousMap;
  }

  if (previousDir === undefined) {
    delete process.env.PIPER_MODEL_DIR;
  } else {
    process.env.PIPER_MODEL_DIR = previousDir;
  }
});
