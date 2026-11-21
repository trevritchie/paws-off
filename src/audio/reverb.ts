import type { AmbienceMode } from '../types/settings';

export interface AmbienceConfig {
  id: AmbienceMode;
  label: string;
  dryGain: number;
  wetGain: number;
  durationSec: number;
  preDelaySec: number;
  damping: number;
  decayPower: number;
  level: number;
}

export const AMBIENCE_CONFIGS: Record<AmbienceMode, AmbienceConfig> = {
  dry: {
    id: 'dry',
    label: 'Dry',
    dryGain: 1.0,
    wetGain: 0.0,
    durationSec: 0,
    preDelaySec: 0,
    damping: 0,
    decayPower: 1,
    level: 0,
  },
  'warm-room': {
    id: 'warm-room',
    label: 'Warm Room',
    dryGain: 0.9,
    wetGain: 0.16,
    durationSec: 0.95,
    preDelaySec: 0.012,
    damping: 0.52,
    decayPower: 3.0,
    level: 0.36,
  },
  'lush-hall': {
    id: 'lush-hall',
    label: 'Lush Hall',
    dryGain: 0.84,
    wetGain: 0.28,
    durationSec: 1.85,
    preDelaySec: 0.024,
    damping: 0.62,
    decayPower: 2.6,
    level: 0.34,
  },
};

export const AMBIENCE_OPTIONS: readonly AmbienceConfig[] = [
  AMBIENCE_CONFIGS.dry,
  AMBIENCE_CONFIGS['warm-room'],
  AMBIENCE_CONFIGS['lush-hall'],
];

interface EarlyTapSpec {
  timeSec: number;
  gain: number;
  pan: number;
}

const EARLY_REFLECTION_TAPS: Record<
  Exclude<AmbienceMode, 'dry'>,
  readonly EarlyTapSpec[]
> = {
  'warm-room': [
    { timeSec: 0.012, gain: 0.52, pan: -0.58 },
    { timeSec: 0.017, gain: 0.44, pan: 0.62 },
    { timeSec: 0.022, gain: 0.36, pan: -0.35 },
    { timeSec: 0.028, gain: 0.31, pan: 0.41 },
    { timeSec: 0.034, gain: 0.25, pan: -0.68 },
    { timeSec: 0.04, gain: 0.21, pan: 0.54 },
    { timeSec: 0.046, gain: 0.16, pan: -0.25 },
    { timeSec: 0.052, gain: 0.13, pan: 0.3 },
  ],
  'lush-hall': [
    { timeSec: 0.024, gain: 0.46, pan: -0.65 },
    { timeSec: 0.029, gain: 0.41, pan: 0.68 },
    { timeSec: 0.035, gain: 0.35, pan: -0.42 },
    { timeSec: 0.041, gain: 0.31, pan: 0.46 },
    { timeSec: 0.047, gain: 0.27, pan: -0.74 },
    { timeSec: 0.053, gain: 0.23, pan: 0.72 },
    { timeSec: 0.059, gain: 0.19, pan: -0.32 },
    { timeSec: 0.065, gain: 0.16, pan: 0.36 },
    { timeSec: 0.071, gain: 0.13, pan: -0.52 },
    { timeSec: 0.076, gain: 0.11, pan: 0.48 },
  ],
};

function createSeededNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  };
}

/**
 * Generates a stereo-decorrelated, pre-delayed studio room/hall impulse response
 * combining discrete multi-tap stereo early reflections, a progressively
 * damped diffuse late tail, and an embedded low-cut blocker for tight clarity.
 */
export function createAmbienceImpulseResponse(
  ctx: BaseAudioContext,
  mode: Exclude<AmbienceMode, 'dry'>,
): AudioBuffer {
  const cfg = AMBIENCE_CONFIGS[mode];
  const sampleRate = ctx.sampleRate;
  const preDelaySamples = Math.floor(cfg.preDelaySec * sampleRate);
  const tailSamples = Math.max(1, Math.floor(cfg.durationSec * sampleRate));
  const totalSamples = preDelaySamples + tailSamples;
  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const channels = [left, right];

  // Pre-delay window stays strictly silent for crisp chord onset clarity.
  for (let ch = 0; ch < 2; ch++) {
    const channelData = channels[ch];
    for (let i = 0; i < preDelaySamples; i++) {
      channelData[i] = 0;
    }

    const nextNoise = createSeededNoise(
      (mode === 'warm-room' ? 0x13572468 : 0x24681357) + ch * 0x9e3779b9,
    );
    let lpState = 0;
    let hpState = 0;
    const attackSamples = Math.min(tailSamples, Math.floor(0.028 * sampleRate));

    for (let i = 0; i < tailSamples; i++) {
      const progress = i / tailSamples;
      const envelope = Math.pow(1 - progress, cfg.decayPower);
      const attackFade =
        i < attackSamples
          ? 0.5 - 0.5 * Math.cos((Math.PI * i) / Math.max(1, attackSamples))
          : 1.0;
      const white = nextNoise();
      const damp = Math.min(0.88, cfg.damping + progress * 0.26);
      lpState = lpState * damp + white * (1 - damp);
      // 1-pole DC / sub-bass blocker keeps low chord roots tight in the tail.
      hpState = hpState * 0.985 + lpState * 0.015;
      const cleaned = lpState - hpState;
      channelData[preDelaySamples + i] =
        cleaned * envelope * attackFade * cfg.level;
    }
  }

  // Inject stereo early reflections with gentle air smoothing across taps.
  const taps = EARLY_REFLECTION_TAPS[mode];
  const erScale = cfg.level * 0.72;
  for (let idx = 0; idx < taps.length; idx++) {
    const tap = taps[idx];
    const centerSample = Math.floor(tap.timeSec * sampleRate);
    if (centerSample < preDelaySamples || centerSample + 2 >= totalSamples) {
      continue;
    }
    const leftGain = tap.gain * Math.sqrt(0.5 * (1 - tap.pan)) * erScale;
    const rightGain = tap.gain * Math.sqrt(0.5 * (1 + tap.pan)) * erScale;
    const sign = idx % 2 === 0 ? 1 : -1;
    // Slight 3-sample diffused tap kernel softens metallic combing on sharp transients.
    const kernel = [0.28, 0.56, 0.16];
    for (let k = 0; k < kernel.length; k++) {
      const pos = centerSample + k;
      if (pos < totalSamples) {
        left[pos] += sign * leftGain * kernel[k];
        right[pos] += -sign * rightGain * kernel[k];
      }
    }
  }

  // Clamp combined peak safely to cfg.level so downstream headroom stays predictable.
  let maxPeak = 0;
  for (let i = 0; i < totalSamples; i++) {
    maxPeak = Math.max(maxPeak, Math.abs(left[i]), Math.abs(right[i]));
  }
  if (maxPeak > cfg.level && maxPeak > 0) {
    const norm = cfg.level / maxPeak;
    for (let i = 0; i < totalSamples; i++) {
      left[i] *= norm;
      right[i] *= norm;
    }
  }

  return buffer;
}
