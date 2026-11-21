import type { ChoirVowel } from '../choirSamples';
import type {
  BuiltVoiceNodes,
  InstrumentPresetMeta,
  VoiceBuildParams,
} from './types';

export const SATB_CHOIR_META: InstrumentPresetMeta = {
  id: 'satb-choir',
  label: 'SATB Choir',
  subtitle: 'Ooh & Ahh voices',
  category: 'winds',
  defaultReleaseSec: 0.56,
  rollStepSec: 0.0,
};

interface FormantBand {
  freq: number;
  q: number;
  gain: number;
}

interface SectionVowelSpec {
  bands: readonly FormantBand[];
  fundMix: number;
  detuneCents: number;
}

// Csound Appendix D singing formant tables for Bass, Tenor, Alto, Soprano
// across 'ooh' (/u/) and 'ahh' (/a/) vowels (used as instant fallback before
// recorded choir samples finish decoding or when offline).
const FORMANT_TABLES: Record<ChoirVowel, readonly SectionVowelSpec[]> = {
  ooh: [
    // 0: Bass /u/
    {
      bands: [
        { freq: 350, q: 5.5, gain: 1.0 },
        { freq: 600, q: 6.5, gain: 0.28 },
        { freq: 2400, q: 10.0, gain: 0.05 },
      ],
      fundMix: 0.44,
      detuneCents: 1.6,
    },
    // 1: Tenor /u/
    {
      bands: [
        { freq: 350, q: 5.5, gain: 1.0 },
        { freq: 600, q: 6.8, gain: 0.25 },
        { freq: 2700, q: 11.0, gain: 0.08 },
      ],
      fundMix: 0.4,
      detuneCents: 2.0,
    },
    // 2: Alto /u/
    {
      bands: [
        { freq: 325, q: 5.2, gain: 1.0 },
        { freq: 700, q: 6.8, gain: 0.34 },
        { freq: 2530, q: 10.0, gain: 0.06 },
      ],
      fundMix: 0.38,
      detuneCents: 2.0,
    },
    // 3: Soprano /u/
    {
      bands: [
        { freq: 325, q: 5.0, gain: 0.95 },
        { freq: 700, q: 6.5, gain: 0.3 },
        { freq: 2700, q: 10.0, gain: 0.05 },
      ],
      fundMix: 0.38,
      detuneCents: 2.2,
    },
  ],
  ahh: [
    // 0: Bass /a/
    {
      bands: [
        { freq: 600, q: 6.0, gain: 1.0 },
        { freq: 1040, q: 7.5, gain: 0.5 },
        { freq: 2250, q: 10.0, gain: 0.22 },
      ],
      fundMix: 0.36,
      detuneCents: 1.6,
    },
    // 1: Tenor /a/
    {
      bands: [
        { freq: 650, q: 5.8, gain: 1.0 },
        { freq: 1080, q: 7.2, gain: 0.52 },
        { freq: 2650, q: 10.5, gain: 0.24 },
      ],
      fundMix: 0.32,
      detuneCents: 2.0,
    },
    // 2: Alto /a/
    {
      bands: [
        { freq: 800, q: 5.8, gain: 1.0 },
        { freq: 1150, q: 7.2, gain: 0.62 },
        { freq: 2800, q: 10.5, gain: 0.14 },
      ],
      fundMix: 0.3,
      detuneCents: 2.0,
    },
    // 3: Soprano /a/
    {
      bands: [
        { freq: 800, q: 5.5, gain: 1.0 },
        { freq: 1150, q: 7.0, gain: 0.54 },
        { freq: 2900, q: 10.0, gain: 0.1 },
      ],
      fundMix: 0.3,
      detuneCents: 2.2,
    },
  ],
};

function getSectionSpec(
  vowel: ChoirVowel,
  voiceIndex: number,
  isBass: boolean,
): SectionVowelSpec {
  const table = FORMANT_TABLES[vowel];
  if (isBass) return table[0];
  const clamped = Math.max(1, Math.min(3, voiceIndex));
  return table[clamped];
}

export function buildSatbChoirVoice({
  ctx,
  now,
  t0,
  freq,
  peakGain,
  note,
  voiceIndex,
  envGain,
  shared,
  choirBank,
}: VoiceBuildParams): BuiltVoiceNodes {
  const isBass = note.role === 'bass';
  const isMelody = note.role === 'melody';
  const vowel: ChoirVowel = note.vowel ?? 'ooh';
  const sample = choirBank?.getSample(vowel, note.midi) ?? null;

  // Primary path: real recorded SATB choir multi-sample (FluidR3_GM Ooh/Ahh)
  if (sample) {
    const src = ctx.createBufferSource();
    src.buffer = sample.buffer;
    src.playbackRate.setValueAtTime(sample.playbackRate, now);
    src.loop = true;
    src.loopStart = Math.min(0.8, Math.max(0.2, sample.buffer.duration * 0.2));
    src.loopEnd = Math.max(src.loopStart + 0.5, sample.buffer.duration - 0.35);

    const polishFilter = ctx.createBiquadFilter();
    polishFilter.type = 'lowpass';
    polishFilter.frequency.setValueAtTime(
      isMelody ? 7800 : isBass ? 2600 : 5200,
      now,
    );
    polishFilter.Q.value = 0.5;

    src.connect(polishFilter);
    polishFilter.connect(envGain);

    // Mastered choir samples sit at ~-18.5 LUFS (-6 dB peak headroom); boost to
    // match Velvet Pad and Felt Piano perceived chord loudness evenly.
    const attackSec = isMelody ? 0.055 : 0.18;
    envGain.gain.linearRampToValueAtTime(peakGain * 2.1, t0 + attackSec);

    return {
      oscs: [],
      bufferSources: [src],
      auxNodes: [polishFilter],
      defaultReleaseSec: isMelody ? 0.22 : SATB_CHOIR_META.defaultReleaseSec,
    };
  }

  // Fallback path: Csound Appendix D section-tuned formant synth ('ooh' or 'ahh')
  const section = getSectionSpec(vowel, voiceIndex, isBass);
  const attackSec = isMelody ? 0.06 : 0.22;

  const oscs: OscillatorNode[] = [];
  const bufferSources: AudioBufferSourceNode[] = [];
  const auxNodes: AudioNode[] = [];

  const sourceBus = ctx.createGain();
  sourceBus.gain.value = 1.0;
  auxNodes.push(sourceBus);

  for (const detune of [-section.detuneCents, section.detuneCents]) {
    const singerOsc = ctx.createOscillator();
    if (shared.choirPeriodicWave) {
      singerOsc.setPeriodicWave(shared.choirPeriodicWave);
    } else {
      singerOsc.type = 'triangle';
    }
    singerOsc.frequency.setValueAtTime(freq, t0);
    singerOsc.detune.setValueAtTime(detune, t0);

    const singerGain = ctx.createGain();
    singerGain.gain.value = 0.46;
    singerOsc.connect(singerGain);
    singerGain.connect(sourceBus);

    oscs.push(singerOsc);
    auxNodes.push(singerGain);
  }

  const voiceOutFilter = ctx.createBiquadFilter();
  voiceOutFilter.type = 'lowpass';
  const baseCutoff =
    vowel === 'ahh' ? (isBass ? 2400 : 3800) : isBass ? 1600 : 2800;
  voiceOutFilter.frequency.setValueAtTime(
    isMelody ? baseCutoff + 1200 : baseCutoff,
    now,
  );
  voiceOutFilter.Q.value = 0.55;
  auxNodes.push(voiceOutFilter);

  for (const band of section.bands) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(band.freq, now);
    bp.Q.value = band.q;

    const fGain = ctx.createGain();
    fGain.gain.value = band.gain * 1.4;

    sourceBus.connect(bp);
    bp.connect(fGain);
    fGain.connect(voiceOutFilter);
    auxNodes.push(bp, fGain);
  }

  const fundOsc = ctx.createOscillator();
  fundOsc.type = 'sine';
  fundOsc.frequency.setValueAtTime(freq, t0);
  const fundGain = ctx.createGain();
  fundGain.gain.value = section.fundMix;
  fundOsc.connect(fundGain);
  fundGain.connect(voiceOutFilter);
  oscs.push(fundOsc);
  auxNodes.push(fundGain);

  const breathSrc = ctx.createBufferSource();
  breathSrc.buffer = shared.noiseBurstBuffer;
  const breathFilter = ctx.createBiquadFilter();
  breathFilter.type = 'bandpass';
  breathFilter.frequency.setValueAtTime(section.bands[1].freq * 1.3, now);
  breathFilter.Q.value = 2.0;
  const breathGain = ctx.createGain();
  breathGain.gain.setValueAtTime(0, now);
  breathGain.gain.setValueAtTime(0, t0);
  breathGain.gain.linearRampToValueAtTime(isBass ? 0.012 : 0.018, t0 + 0.018);
  breathGain.gain.exponentialRampToValueAtTime(0.0003, t0 + 0.048);
  breathSrc.connect(breathFilter);
  breathFilter.connect(breathGain);
  breathGain.connect(voiceOutFilter);
  bufferSources.push(breathSrc);
  auxNodes.push(breathFilter, breathGain);

  voiceOutFilter.connect(envGain);

  envGain.gain.linearRampToValueAtTime(peakGain * 0.9, t0 + attackSec);

  return {
    oscs,
    bufferSources,
    auxNodes,
    defaultReleaseSec: isMelody ? 0.22 : SATB_CHOIR_META.defaultReleaseSec,
  };
}
