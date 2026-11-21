import type {
  AudioOutputProfile,
  ResolvedOutputProfile,
} from '../types/settings';

export interface OutputProfileConfig {
  id: ResolvedOutputProfile;
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
  ResolvedOutputProfile,
  OutputProfileConfig
> = {
  'phone-speaker': {
    id: 'phone-speaker',
    label: 'Phone Speaker',
    description: 'Clear bass and safe loudness for built-in phone speakers',
    subHpfHz: 105,
    bassExciterMix: 0.26,
    presenceGainDb: 1.2,
    airShelfGainDb: -1.0,
    voicePresenceGainDb: 2.2,
    loudnessDrive: 1.68,
    glueThresholdDb: -15,
    glueKneeDb: 14,
    glueRatio: 2.4,
    glueAttackSec: 0.018,
    glueReleaseSec: 0.2,
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
    loudnessDrive: 1.45,
    glueThresholdDb: -13,
    glueKneeDb: 14,
    glueRatio: 2.0,
    glueAttackSec: 0.022,
    glueReleaseSec: 0.22,
  },
};

export interface OutputProfileUiOption {
  id: AudioOutputProfile;
  label: string;
  description: string;
}

export const OUTPUT_PROFILE_UI_OPTIONS: readonly OutputProfileUiOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    description:
      'Detects Bluetooth and desktop outputs; uses Phone Speaker on mobile',
  },
  {
    id: 'phone-speaker',
    label: 'Phone Speaker',
    description: OUTPUT_PROFILE_CONFIGS['phone-speaker'].description,
  },
  {
    id: 'headphones',
    label: 'Headphones',
    description: OUTPUT_PROFILE_CONFIGS.headphones.description,
  },
];

export interface AutoDetectEnvironment {
  outputLatency?: number;
  userAgent?: string;
  isMobileHint?: boolean;
  coarsePointer?: boolean;
}

const EXTERNAL_AUDIO_LABEL_RE =
  /headphone|headset|airpod|buds|bluetooth|earbud|beats|bose|sony|sennheiser|aux|external|usb|hdmi/i;

/**
 * Best-effort synchronous resolution of `'auto'` output mode using output
 * latency (Bluetooth >= 100 ms) and device form factor without prompting for
 * microphone permissions.
 */
export function resolveAutoOutputProfile(
  env: AutoDetectEnvironment = {},
): ResolvedOutputProfile {
  const outputLatency = env.outputLatency;
  if (
    typeof outputLatency === 'number' &&
    Number.isFinite(outputLatency) &&
    outputLatency >= 0.1
  ) {
    return 'headphones';
  }

  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
      : null;
  const userAgent = env.userAgent ?? nav?.userAgent ?? '';
  const isMobileHint = env.isMobileHint ?? nav?.userAgentData?.mobile;
  const coarsePointer =
    env.coarsePointer ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false);

  const isMobile =
    isMobileHint === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    coarsePointer === true;

  return isMobile ? 'phone-speaker' : 'headphones';
}

/**
 * Queries exposed audiooutput labels (when already available without calling
 * getUserMedia) plus AudioContext outputLatency to pick the best profile.
 */
export async function detectOutputProfile(
  ctx: AudioContext | null,
): Promise<ResolvedOutputProfile> {
  const ctxWithLatency = ctx as (AudioContext & { outputLatency?: number }) | null;
  const baseEnv: AutoDetectEnvironment = {
    outputLatency: ctxWithLatency?.outputLatency,
  };

  if (
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.enumerateDevices === 'function'
  ) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasExternalOutput = devices.some(
        (d) =>
          d.kind === 'audiooutput' &&
          typeof d.label === 'string' &&
          d.label.length > 0 &&
          EXTERNAL_AUDIO_LABEL_RE.test(d.label),
      );
      if (hasExternalOutput) {
        return 'headphones';
      }
    } catch {
      // Ignore restricted mediaDevices errors and fall back to heuristics.
    }
  }

  return resolveAutoOutputProfile(baseEnv);
}

/**
 * Generates an odd-symmetric soft-clipping transfer curve that is strictly
 * linear identity inside [-knee, knee] and transitions with C1 continuity
 * via tanh saturation to asymptotically approach `ceiling`.
 */
export function createTransparentSoftClipCurve(
  knee = 0.78,
  ceiling = 0.92,
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
 * Generates a gentle asymmetric harmonic saturator curve with zero DC offset at
 * x=0 so low frequencies produce warm 2nd harmonics for missing-fundamental
 * bass perception without buzzing sustained pads.
 */
export function createBassExciterCurve(
  drive = 1.85,
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
    initialProfile: ResolvedOutputProfile = 'phone-speaker',
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
    bassDrive.gain.value = 1.0;

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
    bassTopLpf.frequency.value = 440;
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
            ws.curve = createTransparentSoftClipCurve(0.78, 0.92);
            ws.oversample = '4x';
            return ws;
          })()
        : (() => {
            const pass = ctx.createGain();
            pass.gain.value = 1.0;
            return pass;
          })();

    const safetyLimiter = ctx.createDynamicsCompressor();
    safetyLimiter.threshold.value = -1.8;
    safetyLimiter.knee.value = 0;
    safetyLimiter.ratio.value = 20;
    safetyLimiter.attack.value = 0.001;
    safetyLimiter.release.value = 0.08;

    const outputTrim = ctx.createGain();
    outputTrim.gain.value = 0.89;

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

  setProfile(profile: ResolvedOutputProfile, atTime?: number): void {
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
