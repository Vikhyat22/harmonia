import { FilterManager } from 'lavalink-client';

export const MUSIC_EFFECT_PRESETS = {
  bassboost: {
    label: 'Bassboost',
    kind: 'eq',
    apply: async (filterManager) => {
      await filterManager.resetFilters();
      await filterManager.setEQPreset('BassboostMedium');
    }
  },
  rock: {
    label: 'Rock',
    kind: 'eq',
    apply: async (filterManager) => {
      await filterManager.resetFilters();
      await filterManager.setEQPreset('Rock');
    }
  },
  pop: {
    label: 'Pop',
    kind: 'eq',
    apply: async (filterManager) => {
      await filterManager.resetFilters();
      await filterManager.setEQPreset('Pop');
    }
  },
  electronic: {
    label: 'Electronic',
    kind: 'eq',
    apply: async (filterManager) => {
      await filterManager.resetFilters();
      await filterManager.setEQPreset('Electronic');
    }
  },
  nightcore: {
    label: 'Nightcore',
    kind: 'toggle',
    apply: async (filterManager) => {
      await filterManager.resetFilters();
      await filterManager.toggleNightcore();
    }
  },
  vaporwave: {
    label: 'Vaporwave',
    kind: 'toggle',
    apply: async (filterManager) => {
      await filterManager.resetFilters();
      await filterManager.toggleVaporwave();
    }
  },
  karaoke: {
    label: 'Karaoke',
    kind: 'toggle',
    apply: async (filterManager) => {
      await filterManager.resetFilters();
      await filterManager.toggleKaraoke();
    }
  },
  '8d': {
    label: '8D',
    kind: 'toggle',
    apply: async (filterManager) => {
      await filterManager.resetFilters();
      await filterManager.toggleRotation(0.2);
    }
  }
};

const EQ_PRESET_LABELS = {
  BassboostMedium: 'Bassboost',
  Rock: 'Rock',
  Pop: 'Pop',
  Electronic: 'Electronic'
};

export function getMusicEffectChoices() {
  return Object.entries(MUSIC_EFFECT_PRESETS).map(([value, effect]) => ({
    name: effect.label,
    value
  }));
}

export async function applyEffectPreset(player, preset) {
  const filterManager = getFilterManager(player);
  const effect = MUSIC_EFFECT_PRESETS[preset];

  if (!filterManager) {
    throw new Error('Nothing is playing right now.');
  }

  if (!effect) {
    throw new Error('Unknown effect preset.');
  }

  await effect.apply(filterManager);
  return getActiveEffectStatus(player);
}

export async function resetPlayerEffects(player) {
  const filterManager = getFilterManager(player);
  if (!filterManager) {
    throw new Error('Nothing is playing right now.');
  }

  await filterManager.resetFilters();
  return getActiveEffectStatus(player);
}

export function getActiveEffectStatus(player) {
  const filterManager = getFilterManager(player);
  if (!filterManager) {
    return {
      active: false,
      label: 'Off',
      detail: 'No music effects are active.'
    };
  }

  const flags = filterManager.filters ?? {};
  const namedEqPreset = detectNamedEqPreset(filterManager.equalizerBands ?? []);

  if (flags.nightcore) {
    return activeStatus('Nightcore', 'Speed and pitch are boosted for a brighter, faster sound.');
  }

  if (flags.vaporwave) {
    return activeStatus('Vaporwave', 'Playback is slowed and pitched down for a dreamy sound.');
  }

  if (flags.karaoke) {
    return activeStatus('Karaoke', 'Center vocals are reduced for sing-along playback.');
  }

  if (flags.rotation) {
    return activeStatus('8D', 'Stereo rotation is enabled for a moving headphone effect.');
  }

  if (namedEqPreset) {
    return activeStatus(namedEqPreset, 'An equalizer preset is shaping the current playback.');
  }

  if (flags.custom) {
    return activeStatus('Custom Timescale', 'A custom speed, pitch, or rate effect is active.');
  }

  if (flags.tremolo) {
    return activeStatus('Tremolo', 'A repeating volume pulse effect is active.');
  }

  if (flags.vibrato) {
    return activeStatus('Vibrato', 'A repeating pitch modulation effect is active.');
  }

  if (flags.lowPass) {
    return activeStatus('Low Pass', 'High frequencies are softened for a warmer sound.');
  }

  return {
    active: false,
    label: 'Off',
    detail: 'No music effects are active.'
  };
}

function getFilterManager(player) {
  return player?.filterManager ?? null;
}

function activeStatus(label, detail) {
  return {
    active: true,
    label,
    detail
  };
}

function detectNamedEqPreset(equalizerBands) {
  if (!Array.isArray(equalizerBands) || equalizerBands.length === 0) {
    return null;
  }

  for (const [presetName, presetBands] of Object.entries(FilterManager.EQList)) {
    if (!(presetName in EQ_PRESET_LABELS)) {
      continue;
    }

    if (areEqBandsEqual(equalizerBands, presetBands)) {
      return EQ_PRESET_LABELS[presetName];
    }
  }

  return 'Custom EQ';
}

function areEqBandsEqual(leftBands, rightBands) {
  const normalize = (bands) => bands
    .map((band) => ({
      band: Number(band.band),
      gain: Number(Number(band.gain).toFixed(4))
    }))
    .sort((a, b) => a.band - b.band);

  const left = normalize(leftBands);
  const right = normalize(rightBands);
  if (left.length !== right.length) {
    return false;
  }

  return left.every((band, index) => (
    band.band === right[index].band && band.gain === right[index].gain
  ));
}
