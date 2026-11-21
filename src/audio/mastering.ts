import type { AudioOutputProfile } from '../types/settings';

export interface OutputProfileConfig {
  id: AudioOutputProfile;
  label: string;
  description: string;
  subHpfHz: number;
  bassExciterMix: number;
  presenceGainDb: number;
  airShelfGainDb: number;
  voicePresenceGainDb: number;
  loudnessDrive: number;
  glueThresholdDb: number;
  glueKneeDb: number;
  glueRatio: number;
  glueAttackSec: number;
  glueReleaseSec: number;
}

export const OUTPUT_PROFILE_CONFIGS: Record<
  AudioOutputProfile,
  OutputProfileConfig
> = {
  'phone-speaker': {
    id: 'phone-speaker',
    label: 'Phone Speaker',
    description: 'Loud, distortion-free mix with clear bass on small speakers',
    subHpfHz: 95,
    bassExciterMix: 0.38,
    presenceGainDb: 1.8,
    airShelfGainDb: -1.0,
    voicePresenceGainDb: 2.5,
    loudnessDrive: 2.15,
    glueThresholdDb: -14,
    glueKneeDb: 12,
    glueRatio: 2.8,
    glueAttackSec: 0.015,
    glueReleaseSec: 0.18,
  },
  headphones: {
    id: 'headphones',
    label: 'Headphones',
    description: 'Full dynamic range and deep natural bass',
    subHpfHz: 30,
    bassExciterMix: 0.0,
    presenceGainDb: 0,
    airShelfGainDb: 0,
    voicePresenceGainDb: 0,
    loudnessDrive: 1.55,
    glueThresholdDb: -12,
    glueKneeDb: 14,
    glueRatio: 2.2,
    glueAttackSec: 0.022,
    glueReleaseSec: 0.22,
  },
};

export const OUTPUT_PROFILE_OPTIONS: readonly OutputProfileConfig[] = [
  OUTPUT_PROFILE_CONFIGS['phone-speaker'],
  OUTPUT_PROFILE_CONFIGS.headphones,
];

/**
 * Generates an odd-symmetric soft-clipping transfer curve that is strictly
 * linear identity inside [-knee, knee] and transitions with C1 continuity
 * via tanh saturation to asymptotically approach `ceiling`.
 */
export function createTransparentSoftClipCurve(
  knee = 0.72,
  ceiling = 0.94,
  length = 2048,
): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(length * 4));
  const headroom = Math.max(0.01, ceiling - knee);

  for (let i = 0; i < length; i++) {
    const x = (i * 2) / (length - 1) - 1;
    const absX = Math.abs(x);
    if (absX <= knee) {
      curve[i] = x;
    } else {
      const sign = x < 0 ? -1 : 1;
      curve[i] = sign * (knee + headroom * Math.tanh((absX - knee) / headroom));
    }
  }

  return curve;
}

/**
 * Generates an asymmetric harmonic saturator curve with zero DC offset at x=0
 * so low frequencies produce both 2nd and 3rd harmonics for missing-fundamental
 * bass perception on small phone speakers.
 */
export function createBassExciterCurve(
  drive = 2.6,
  asymmetry = 0.22,
  length = 1024,
): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(length * 4));
  const raw = (x: number) => Math.tanh(drive * (x + asymmetry * x * x));
  const zeroOffset = raw(0);
  const norm = Math.max(
    1e-6,
    Math.abs(raw(1) - zeroOffset),
    Math.abs(raw(-1) - zeroOffset),
  );

  for (let i = 0; i < length; i++) {
    const x = (i * 2) / (length - 1) - 1;
    curve[i] = (raw(x) - zeroOffset) / norm;
  }

  return curve;
}

/**
 * Native Web Audio mastering output chain with live-switchable Phone Speaker
 * and Headphones profiles:
 *   input -> [subHpf || parallel 4x bass exciter] -> tonalSum
 *   -> presenceEq -> airShelf -> loudnessDriveGain
 *   -> glueCompressor -> 4x transparent softClipper -> safetyLimiter -> outputTrim
 */
export class MasterOutputChain {
  readonly input: GainNode;
  readonly voicePresenceEq: BiquadFilterNode;
  readonly output: GainNode;
  readonly nodes: AudioNode[];

  private readonly ctx: AudioContext;
  private readonly subHpf: BiquadFilterNode;
  private readonly bassExciterMix: GainNode;
  private readonly presenceEq: BiquadFilterNode;
  private readonly airShelf: BiquadFilterNode;
  private readonly loudnessDriveGain: GainNode;
  private readonly glueCompressor: DynamicsCompressorNode;

  constructor(
    ctx: AudioContext,
    initialProfile: AudioOutputProfile = 'phone-speaker',
  ) {
    this.ctx = ctx;
    const cfg = OUTPUT_PROFILE_CONFIGS[initialProfile];

    const input = ctx.createGain();
    input.gain.value = 1.0;

    const voicePresenceEq = ctx.createBiquadFilter();
    voicePresenceEq.type = 'peaking';
    voicePresenceEq.frequency.value = 2800;
    voicePresenceEq.Q.value = 1.1;
    voicePresenceEq.gain.value = cfg.voicePresenceGainDb;

    const subHpf = ctx.createBiquadFilter();
    subHpf.type = 'highpass';
    subHpf.frequency.value = cfg.subHpfHz;
    subHpf.Q.value = 0.707;

    const tonalSum = ctx.createGain();
    tonalSum.gain.value = 1.0;

    // Parallel psychoacoustic bass harmonic exciter summed strictly pre-compressor
    // so DynamicsCompressorNode lookahead never causes comb filtering.
    const bassLpf = ctx.createBiquadFilter();
    bassLpf.type = 'lowpass';
    bassLpf.frequency.value = 155;
    bassLpf.Q.value = 0.707;

    const bassDrive = ctx.createGain();
    bassDrive.gain.value = 1.35;

    const bassShaper: AudioNode =
      typeof ctx.createWaveShaper === 'function'
        ? (() => {
            const ws = ctx.createWaveShaper();
            ws.curve = createBassExciterCurve();
            ws.oversample = '4x';
            return ws;
          })()
        : (() => {
            const pass = ctx.createGain();
            pass.gain.value = 1.0;
            return pass;
          })();

    const bassHpf = ctx.createBiquadFilter();
    bassHpf.type = 'highpass';
    bassHpf.frequency.value = 140;
    bassHpf.Q.value = 0.707;

    const bassTopLpf = ctx.createBiquadFilter();
    bassTopLpf.type = 'lowpass';
    bassTopLpf.frequency.value = 620;
    bassTopLpf.Q.value = 0.707;

    const bassExciterMix = ctx.createGain();
    bassExciterMix.gain.value = cfg.bassExciterMix;

    const presenceEq = ctx.createBiquadFilter();
    presenceEq.type = 'peaking';
    presenceEq.frequency.value = 2400;
    presenceEq.Q.value = 0.9;
    presenceEq.gain.value = cfg.presenceGainDb;

    const airShelf = ctx.createBiquadFilter();
    airShelf.type = 'highshelf';
    airShelf.frequency.value = 7500;
    airShelf.gain.value = cfg.airShelfGainDb;

    const loudnessDriveGain = ctx.createGain();
    loudnessDriveGain.gain.value = cfg.loudnessDrive;

    const glueCompressor = ctx.createDynamicsCompressor();
    glueCompressor.threshold.value = cfg.glueThresholdDb;
    glueCompressor.knee.value = cfg.glueKneeDb;
    glueCompressor.ratio.value = cfg.glueRatio;
    glueCompressor.attack.value = cfg.glueAttackSec;
    glueCompressor.release.value = cfg.glueReleaseSec;

    const softClipper: AudioNode =
      typeof ctx.createWaveShaper === 'function'
        ? (() => {
            const ws = ctx.createWaveShaper();
            ws.curve = createTransparentSoftClipCurve(0.72, 0.94);
            ws.oversample = '4x';
            return ws;
          })()
        : (() => {
            const pass = ctx.createGain();
            pass.gain.value = 1.0;
            return pass;
          })();

    const safetyLimiter = ctx.createDynamicsCompressor();
    safetyLimiter.threshold.value = -1.2;
    safetyLimiter.knee.value = 0;
    safetyLimiter.ratio.value = 20;
    safetyLimiter.attack.value = 0.001;
    safetyLimiter.release.value = 0.08;

    const outputTrim = ctx.createGain();
    outputTrim.gain.value = 0.94;

    voicePresenceEq.connect(input);

    input.connect(subHpf);
    subHpf.connect(tonalSum);

    input.connect(bassLpf);
    bassLpf.connect(bassDrive);
    bassDrive.connect(bassShaper);
    bassShaper.connect(bassHpf);
    bassHpf.connect(bassTopLpf);
    bassTopLpf.connect(bassExciterMix);
    bassExciterMix.connect(tonalSum);

    tonalSum.connect(presenceEq);
    presenceEq.connect(airShelf);
    airShelf.connect(loudnessDriveGain);
    loudnessDriveGain.connect(glueCompressor);
    glueCompressor.connect(softClipper);
    softClipper.connect(safetyLimiter);
    safetyLimiter.connect(outputTrim);

    this.input = input;
    this.voicePresenceEq = voicePresenceEq;
    this.output = outputTrim;
    this.subHpf = subHpf;
    this.bassExciterMix = bassExciterMix;
    this.presenceEq = presenceEq;
    this.airShelf = airShelf;
    this.loudnessDriveGain = loudnessDriveGain;
    this.glueCompressor = glueCompressor;
    this.nodes = [
      input,
      voicePresenceEq,
      subHpf,
      tonalSum,
      bassLpf,
      bassDrive,
      bassShaper,
      bassHpf,
      bassTopLpf,
      bassExciterMix,
      presenceEq,
      airShelf,
      loudnessDriveGain,
      glueCompressor,
      softClipper,
      safetyLimiter,
      outputTrim,
    ];
  }

  setProfile(profile: AudioOutputProfile, atTime?: number): void {
    const cfg = OUTPUT_PROFILE_CONFIGS[profile];
    const t = Math.max(this.ctx.currentTime, atTime ?? this.ctx.currentTime);
    const tau = 0.03;

    this.subHpf.frequency.setTargetAtTime(cfg.subHpfHz, t, tau);
    this.bassExciterMix.gain.setTargetAtTime(cfg.bassExciterMix, t, tau);
    this.presenceEq.gain.setTargetAtTime(cfg.presenceGainDb, t, tau);
    this.airShelf.gain.setTargetAtTime(cfg.airShelfGainDb, t, tau);
    this.voicePresenceEq.gain.setTargetAtTime(cfg.voicePresenceGainDb, t, tau);
    this.loudnessDriveGain.gain.setTargetAtTime(cfg.loudnessDrive, t, tau);
    this.glueCompressor.threshold.setTargetAtTime(cfg.glueThresholdDb, t, tau);
    this.glueCompressor.knee.setTargetAtTime(cfg.glueKneeDb, t, tau);
    this.glueCompressor.ratio.setTargetAtTime(cfg.glueRatio, t, tau);
    this.glueCompressor.attack.setTargetAtTime(cfg.glueAttackSec, t, tau);
    this.glueCompressor.release.setTargetAtTime(cfg.glueReleaseSec, t, tau);
  }

  dispose(): void {
    for (const node of this.nodes) {
      try {
        node.disconnect();
      } catch {
        // Ignore already-disconnected nodes.
      }
    }
  }
}
