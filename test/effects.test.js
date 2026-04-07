import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MUSIC_EFFECT_PRESETS,
  applyEffectPreset,
  getActiveEffectStatus,
  getMusicEffectChoices,
  resetPlayerEffects
} from '../src/services/effects.js';

function createPlayer() {
  return {
    filterManager: {
      filters: {
        custom: false,
        nightcore: false,
        vaporwave: false,
        rotation: false,
        karaoke: false,
        tremolo: false,
        vibrato: false,
        lowPass: false,
        audioOutput: 'stereo',
        nodeLinkEcho: false,
        nodeLinkChorus: false,
        nodeLinkCompressor: false,
        nodeLinkHighPass: false,
        nodeLinkPhaser: false,
        nodeLinkSpatial: false,
        volume: false,
        lavalinkFilterPlugin: {
          echo: false,
          reverb: false,
        },
      },
      equalizerBands: [],
      async resetFilters() {
        this.filters.nightcore = false;
        this.filters.vaporwave = false;
        this.filters.rotation = false;
        this.filters.karaoke = false;
        this.filters.custom = false;
        this.equalizerBands = [];
        return this;
      },
      async setEQPreset(name) {
        this.equalizerBands = [{ band: 0, gain: name === 'BassboostMedium' ? 0.2 : 0.1 }];
        this.filters.custom = false;
        this._eqPreset = name;
        return this;
      },
      async toggleNightcore() {
        this.filters.nightcore = !this.filters.nightcore;
        return this;
      },
      async toggleVaporwave() {
        this.filters.vaporwave = !this.filters.vaporwave;
        return this;
      },
      async toggleKaraoke() {
        this.filters.karaoke = !this.filters.karaoke;
        return this;
      },
      async toggleRotation() {
        this.filters.rotation = !this.filters.rotation;
        return this;
      },
    }
  };
}

test('effects service exposes the expected preset choices', () => {
  const choices = getMusicEffectChoices();
  assert.deepEqual(
    choices.map((choice) => choice.value),
    Object.keys(MUSIC_EFFECT_PRESETS)
  );
});

test('applyEffectPreset enables named toggle-style effects', async () => {
  const player = createPlayer();

  const status = await applyEffectPreset(player, 'nightcore');

  assert.equal(status.active, true);
  assert.equal(status.label, 'Nightcore');
  assert.equal(player.filterManager.filters.nightcore, true);
});

test('resetPlayerEffects clears active effect state', async () => {
  const player = createPlayer();
  await applyEffectPreset(player, 'karaoke');

  const status = await resetPlayerEffects(player);

  assert.equal(status.active, false);
  assert.equal(status.label, 'Off');
  assert.equal(player.filterManager.filters.karaoke, false);
});

test('getActiveEffectStatus reports inactive players clearly', () => {
  const status = getActiveEffectStatus({ filterManager: null });

  assert.equal(status.active, false);
  assert.equal(status.label, 'Off');
  assert.match(status.detail, /No music effects are active/);
});
