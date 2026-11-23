export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type TriadId = 'I' | 'ii' | 'iii' | 'IV' | 'V' | 'vi' | 'viio';
export type SeventhId =
  | 'Imaj7'
  | 'ii7'
  | 'iii7'
  | 'IVmaj7'
  | 'V7'
  | 'vi7'
  | 'viihalfdim7';

export type DiatonicChordId = TriadId | SeventhId;

export type SecondaryTriadId = 'V/ii' | 'V/iii' | 'V/V' | 'V/vi';
export type SecondarySeventhId =
  | 'V7/ii'
  | 'V7/iii'
  | 'V7/IV'
  | 'V7/V'
  | 'V7/vi';

export type SecondaryDominantId = SecondaryTriadId | SecondarySeventhId;

export type ChordId = DiatonicChordId | SecondaryDominantId;

export type TriadInversion = 0 | 1 | 2;
export type SeventhInversion = 0 | 1 | 2 | 3;
export type ChordInversion = 0 | 1 | 2 | 3;
export type InversionNotation =
  | 'inversion-name'
  | 'figured-bass'
  | 'bass-tone'
  | 'scale-degree'
  | 'solfege';

export interface ProgressionChord {
  chordId: ChordId;
  inversion: ChordInversion;
}

export type TimbreId =
  | 'velvet-pad'
  | 'grand-piano'
  | 'warm-strings'
  | 'chamber-cello'
  | 'satb-choir'
  | 'french-horn'
  | 'concert-harp'
  | 'nylon-guitar'
  | 'clean-guitar'
  | 'harmonium'
  | 'pipe-organ'
  | 'felt-piano'
  | 'warm-rhodes'
  | 'soft-vibes'
  | 'wurlitzer'
  | 'juno-poly'
  | 'jazz-organ'
  | 'glass-celesta'
  | 'marimba'
  | 'woodwind-choir'
  | 'steel-guitar'
  | 'pizzicato-strings'
  | 'warm-sax'
  | 'warm-trombone'
  | 'lofi-tape'
  | 'harpsichord'
  | 'kalimba'
  | 'analog-brass'
  | 'retro-8bit'
  | 'shimmer-pad';
export type ResolvedOutputProfile = 'phone-speaker' | 'headphones';
export type AudioOutputProfile = 'auto' | ResolvedOutputProfile;
export type AmbienceMode = 'dry' | 'warm-room' | 'lush-hall';
export type VoicePanningMode = 'left-to-right' | 'satb' | 'random';
export type KeyMode = 'fixed' | 'auto-rotate';
export type KeyOrientationMode = 'cadence' | 'tonic' | 'none';
export type ScaleDegree = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type DroneOctave = -1 | 0 | 1 | 2;
export type HalfDimNaming = 'half-diminished' | 'minor-seven-flat-five';
export type VoiceSource = 'recorded' | 'speech-synthesis';

export interface SessionSettings {
  allowedChords: DiatonicChordId[];
  secondaryDominantsEnabled: boolean;
  allowedSecondaryDominants: SecondaryDominantId[];
  strictSecondaryResolution: boolean;
  triadInversions: TriadInversion[];
  seventhInversions: SeventhInversion[];
  chordInversionOverrides: Partial<Record<ChordId, ChordInversion[]>>;
  inversionNotation: InversionNotation;
  musicalInversionLeading: boolean;
  melodyEnabled: boolean;
  melodyAllowTensions: boolean;
  melodyVolume: number;
  melodyTimbre: TimbreId;
  bpm: number;
  progressionLength: number;
  questionRepeats: number;
  playChordsBehindAnswer: boolean;
  playFinalReplayAfterAnswer: boolean;
  timbre: TimbreId;
  outputProfile: AudioOutputProfile;
  ambience: AmbienceMode;
  voicePanning: boolean;
  voicePanningMode: VoicePanningMode;
  chordVolume: number;
  voiceVolume: number;
  keyMode: KeyMode;
  fixedKey: PitchClass;
  rotateEveryNQuestions: number;
  keyOrientation: KeyOrientationMode;
  droneEnabled: boolean;
  droneScaleDegree: ScaleDegree;
  droneOctave: DroneOctave;
  droneVolume: number;
  repeatPauseSec: number;
  speechRate: number;
  speechVoiceURI: string | null;
  announceTriadQuality: boolean;
  halfDimNaming: HalfDimNaming;
  voiceSource: VoiceSource;
}

export const VALID_DIATONIC_CHORD_IDS: readonly DiatonicChordId[] = [
  'I',
  'ii',
  'iii',
  'IV',
  'V',
  'vi',
  'viio',
  'Imaj7',
  'ii7',
  'iii7',
  'IVmaj7',
  'V7',
  'vi7',
  'viihalfdim7',
];

export const VALID_SECONDARY_DOMINANT_IDS: readonly SecondaryDominantId[] = [
  'V/ii',
  'V/iii',
  'V/V',
  'V/vi',
  'V7/ii',
  'V7/iii',
  'V7/IV',
  'V7/V',
  'V7/vi',
];

export const VALID_CHORD_IDS: readonly ChordId[] = [
  ...VALID_DIATONIC_CHORD_IDS,
  ...VALID_SECONDARY_DOMINANT_IDS,
];

const VALID_DIATONIC_CHORD_SET = new Set<string>(VALID_DIATONIC_CHORD_IDS);
const VALID_SECONDARY_DOMINANT_SET = new Set<string>(
  VALID_SECONDARY_DOMINANT_IDS,
);
const VALID_CHORD_SET = new Set<string>(VALID_CHORD_IDS);
const SEVENTH_CHORD_SET = new Set<string>([
  'Imaj7',
  'ii7',
  'iii7',
  'IVmaj7',
  'V7',
  'vi7',
  'viihalfdim7',
  'V7/ii',
  'V7/iii',
  'V7/IV',
  'V7/V',
  'V7/vi',
]);

export const LEGACY_SETTINGS_STORAGE_KEY = 'paws-off:settings:v1';
export const SETTINGS_STORAGE_KEY = 'paws-off:settings:v2';
export const VOLUME_CALIBRATION_VERSION = 2;

export const DEFAULT_SETTINGS: SessionSettings = {
  allowedChords: ['I', 'IV', 'V', 'vi'],
  secondaryDominantsEnabled: false,
  allowedSecondaryDominants: ['V7/ii', 'V7/iii', 'V7/IV', 'V7/V', 'V7/vi'],
  strictSecondaryResolution: true,
  triadInversions: [0],
  seventhInversions: [0],
  chordInversionOverrides: {},
  inversionNotation: 'inversion-name',
  musicalInversionLeading: true,
  melodyEnabled: false,
  melodyAllowTensions: false,
  melodyVolume: 0.5,
  melodyTimbre: 'grand-piano',
  bpm: 120,
  progressionLength: 4,
  questionRepeats: 2,
  playChordsBehindAnswer: true,
  playFinalReplayAfterAnswer: true,
  timbre: 'grand-piano',
  outputProfile: 'auto',
  ambience: 'warm-room',
  voicePanning: true,
  voicePanningMode: 'satb',
  chordVolume: 0.8,
  voiceVolume: 0.8,
  keyMode: 'auto-rotate',
  fixedKey: 0,
  rotateEveryNQuestions: 5,
  keyOrientation: 'cadence',
  droneEnabled: false,
  droneScaleDegree: 1,
  droneOctave: 0,
  droneVolume: 0.5,
  repeatPauseSec: 1.2,
  speechRate: 1.0,
  speechVoiceURI: null,
  announceTriadQuality: false,
  halfDimNaming: 'half-diminished',
  voiceSource: 'recorded',
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function sanitizePitchClass(value: unknown, fallback: PitchClass): PitchClass {
  const num = clampInt(value, 0, 11, fallback);
  return num as PitchClass;
}

function sanitizeInversionList<T extends ChordInversion>(
  raw: unknown,
  maxInv: 2 | 3,
): T[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<number>();
  for (const item of raw) {
    if (
      typeof item === 'number' &&
      Number.isInteger(item) &&
      item >= 0 &&
      item <= maxInv
    ) {
      valid.add(item);
    }
  }
  return Array.from(valid).sort((a, b) => a - b) as T[];
}

export function sanitizeSettings(raw: unknown): SessionSettings {
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_SETTINGS,
      allowedChords: [...DEFAULT_SETTINGS.allowedChords],
      allowedSecondaryDominants: [...DEFAULT_SETTINGS.allowedSecondaryDominants],
      triadInversions: [...DEFAULT_SETTINGS.triadInversions],
      seventhInversions: [...DEFAULT_SETTINGS.seventhInversions],
      chordInversionOverrides: {},
    };
  }

  const obj = raw as Record<string, unknown>;

  let allowedChords: DiatonicChordId[] = [...DEFAULT_SETTINGS.allowedChords];
  if (Array.isArray(obj.allowedChords)) {
    const deduped = Array.from(
      new Set(
        obj.allowedChords.filter(
          (item): item is DiatonicChordId =>
            typeof item === 'string' && VALID_DIATONIC_CHORD_SET.has(item),
        ),
      ),
    );
    if (deduped.length > 0) {
      allowedChords = deduped;
    }
  }

  let allowedSecondaryDominants: SecondaryDominantId[] = [
    ...DEFAULT_SETTINGS.allowedSecondaryDominants,
  ];
  if (Array.isArray(obj.allowedSecondaryDominants)) {
    const deduped = Array.from(
      new Set(
        obj.allowedSecondaryDominants.filter(
          (item): item is SecondaryDominantId =>
            typeof item === 'string' && VALID_SECONDARY_DOMINANT_SET.has(item),
        ),
      ),
    );
    if (deduped.length > 0) {
      allowedSecondaryDominants = deduped;
    }
  }

  const sanitizedTriadInversions = sanitizeInversionList<TriadInversion>(
    obj.triadInversions,
    2,
  );
  const triadInversions: TriadInversion[] =
    sanitizedTriadInversions.length > 0
      ? sanitizedTriadInversions
      : [...DEFAULT_SETTINGS.triadInversions];

  const sanitizedSeventhInversions = sanitizeInversionList<SeventhInversion>(
    obj.seventhInversions,
    3,
  );
  const seventhInversions: SeventhInversion[] =
    sanitizedSeventhInversions.length > 0
      ? sanitizedSeventhInversions
      : [...DEFAULT_SETTINGS.seventhInversions];

  const chordInversionOverrides: Partial<Record<ChordId, ChordInversion[]>> = {};
  if (
    obj.chordInversionOverrides &&
    typeof obj.chordInversionOverrides === 'object' &&
    !Array.isArray(obj.chordInversionOverrides)
  ) {
    const rawOverrides = obj.chordInversionOverrides as Record<string, unknown>;
    for (const [key, val] of Object.entries(rawOverrides)) {
      if (!VALID_CHORD_SET.has(key)) continue;
      const chordKey = key as ChordId;
      const maxInv: 2 | 3 = SEVENTH_CHORD_SET.has(key) ? 3 : 2;
      const list = sanitizeInversionList<ChordInversion>(val, maxInv);
      if (list.length > 0) {
        chordInversionOverrides[chordKey] = list;
      }
    }
  }

  const inversionNotation: InversionNotation =
    obj.inversionNotation === 'inversion-name' ||
    obj.inversionNotation === 'figured-bass' ||
    obj.inversionNotation === 'bass-tone' ||
    obj.inversionNotation === 'scale-degree' ||
    obj.inversionNotation === 'solfege'
      ? obj.inversionNotation
      : DEFAULT_SETTINGS.inversionNotation;

  const validTimbres: readonly TimbreId[] = [
    'velvet-pad',
    'grand-piano',
    'warm-strings',
    'chamber-cello',
    'satb-choir',
    'french-horn',
    'concert-harp',
    'nylon-guitar',
    'clean-guitar',
    'harmonium',
    'pipe-organ',
    'felt-piano',
    'warm-rhodes',
    'soft-vibes',
    'wurlitzer',
    'juno-poly',
    'jazz-organ',
    'glass-celesta',
    'marimba',
    'woodwind-choir',
    'steel-guitar',
    'pizzicato-strings',
    'warm-sax',
    'warm-trombone',
    'lofi-tape',
    'harpsichord',
    'kalimba',
    'analog-brass',
    'retro-8bit',
    'shimmer-pad',
  ];
  const timbre: TimbreId =
    typeof obj.timbre === 'string' &&
    (validTimbres as readonly string[]).includes(obj.timbre)
      ? (obj.timbre as TimbreId)
      : DEFAULT_SETTINGS.timbre;

  const melodyTimbre: TimbreId =
    typeof obj.melodyTimbre === 'string' &&
    (validTimbres as readonly string[]).includes(obj.melodyTimbre)
      ? (obj.melodyTimbre as TimbreId)
      : timbre;

  const outputProfile: AudioOutputProfile =
    obj.outputProfile === 'auto' ||
    obj.outputProfile === 'phone-speaker' ||
    obj.outputProfile === 'headphones'
      ? obj.outputProfile
      : DEFAULT_SETTINGS.outputProfile;

  const ambience: AmbienceMode =
    obj.ambience === 'dry' ||
    obj.ambience === 'warm-room' ||
    obj.ambience === 'lush-hall'
      ? obj.ambience
      : DEFAULT_SETTINGS.ambience;

  const voicePanningMode: VoicePanningMode =
    obj.voicePanningMode === 'left-to-right' ||
    obj.voicePanningMode === 'satb' ||
    obj.voicePanningMode === 'random'
      ? obj.voicePanningMode
      : DEFAULT_SETTINGS.voicePanningMode;

  const keyMode: KeyMode =
    obj.keyMode === 'auto-rotate' || obj.keyMode === 'fixed'
      ? obj.keyMode
      : DEFAULT_SETTINGS.keyMode;

  const keyOrientation: KeyOrientationMode =
    obj.keyOrientation === 'cadence' ||
    obj.keyOrientation === 'tonic' ||
    obj.keyOrientation === 'none'
      ? obj.keyOrientation
      : DEFAULT_SETTINGS.keyOrientation;

  const halfDimNaming: HalfDimNaming =
    obj.halfDimNaming === 'half-diminished' ||
    obj.halfDimNaming === 'minor-seven-flat-five'
      ? obj.halfDimNaming
      : DEFAULT_SETTINGS.halfDimNaming;

  const voiceSource: VoiceSource =
    obj.voiceSource === 'recorded' || obj.voiceSource === 'speech-synthesis'
      ? obj.voiceSource
      : DEFAULT_SETTINGS.voiceSource;

  const hasCalibratedVolumes =
    obj.volumeCalibrationVersion === VOLUME_CALIBRATION_VERSION;

  return {
    allowedChords,
    secondaryDominantsEnabled:
      typeof obj.secondaryDominantsEnabled === 'boolean'
        ? obj.secondaryDominantsEnabled
        : DEFAULT_SETTINGS.secondaryDominantsEnabled,
    allowedSecondaryDominants,
    strictSecondaryResolution:
      typeof obj.strictSecondaryResolution === 'boolean'
        ? obj.strictSecondaryResolution
        : DEFAULT_SETTINGS.strictSecondaryResolution,
    triadInversions,
    seventhInversions,
    chordInversionOverrides,
    inversionNotation,
    musicalInversionLeading:
      typeof obj.musicalInversionLeading === 'boolean'
        ? obj.musicalInversionLeading
        : DEFAULT_SETTINGS.musicalInversionLeading,
    melodyEnabled:
      typeof obj.melodyEnabled === 'boolean'
        ? obj.melodyEnabled
        : DEFAULT_SETTINGS.melodyEnabled,
    melodyAllowTensions:
      typeof obj.melodyAllowTensions === 'boolean'
        ? obj.melodyAllowTensions
        : DEFAULT_SETTINGS.melodyAllowTensions,
    melodyVolume: clampNumber(
      obj.melodyVolume,
      0,
      1,
      DEFAULT_SETTINGS.melodyVolume,
    ),
    melodyTimbre,
    bpm: clampInt(obj.bpm, 60, 240, DEFAULT_SETTINGS.bpm),
    progressionLength: clampInt(
      obj.progressionLength,
      2,
      8,
      DEFAULT_SETTINGS.progressionLength,
    ),
    questionRepeats: clampInt(
      obj.questionRepeats,
      1,
      5,
      DEFAULT_SETTINGS.questionRepeats,
    ),
    playChordsBehindAnswer:
      typeof obj.playChordsBehindAnswer === 'boolean'
        ? obj.playChordsBehindAnswer
        : DEFAULT_SETTINGS.playChordsBehindAnswer,
    playFinalReplayAfterAnswer:
      typeof obj.playFinalReplayAfterAnswer === 'boolean'
        ? obj.playFinalReplayAfterAnswer
        : DEFAULT_SETTINGS.playFinalReplayAfterAnswer,
    timbre,
    outputProfile,
    ambience,
    voicePanning:
      typeof obj.voicePanning === 'boolean'
        ? obj.voicePanning
        : DEFAULT_SETTINGS.voicePanning,
    voicePanningMode,
    chordVolume: hasCalibratedVolumes
      ? clampNumber(obj.chordVolume, 0, 1, DEFAULT_SETTINGS.chordVolume)
      : DEFAULT_SETTINGS.chordVolume,
    voiceVolume: hasCalibratedVolumes
      ? clampNumber(obj.voiceVolume, 0, 1, DEFAULT_SETTINGS.voiceVolume)
      : DEFAULT_SETTINGS.voiceVolume,
    keyMode,
    fixedKey: sanitizePitchClass(obj.fixedKey, DEFAULT_SETTINGS.fixedKey),
    rotateEveryNQuestions: clampInt(
      obj.rotateEveryNQuestions,
      1,
      20,
      DEFAULT_SETTINGS.rotateEveryNQuestions,
    ),
    keyOrientation,
    droneEnabled:
      typeof obj.droneEnabled === 'boolean'
        ? obj.droneEnabled
        : DEFAULT_SETTINGS.droneEnabled,
    droneScaleDegree: clampInt(
      obj.droneScaleDegree,
      1,
      7,
      DEFAULT_SETTINGS.droneScaleDegree,
    ) as ScaleDegree,
    droneOctave: clampInt(
      obj.droneOctave,
      -1,
      2,
      DEFAULT_SETTINGS.droneOctave,
    ) as DroneOctave,
    droneVolume: hasCalibratedVolumes
      ? clampNumber(obj.droneVolume, 0, 1, DEFAULT_SETTINGS.droneVolume)
      : DEFAULT_SETTINGS.droneVolume,
    repeatPauseSec: clampNumber(
      obj.repeatPauseSec,
      0.4,
      3.0,
      DEFAULT_SETTINGS.repeatPauseSec,
    ),
    speechRate: clampNumber(obj.speechRate, 0.7, 1.4, DEFAULT_SETTINGS.speechRate),
    speechVoiceURI:
      typeof obj.speechVoiceURI === 'string' && obj.speechVoiceURI.length > 0
        ? obj.speechVoiceURI
        : null,
    announceTriadQuality:
      typeof obj.announceTriadQuality === 'boolean'
        ? obj.announceTriadQuality
        : DEFAULT_SETTINGS.announceTriadQuality,
    halfDimNaming,
    voiceSource,
  };
}

export function loadSettings(): SessionSettings {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return sanitizeSettings(null);
    }
    // Force-reset pre-v2 saved settings once so existing devices pick up new defaults.
    if (window.localStorage.getItem(LEGACY_SETTINGS_STORAGE_KEY) !== null) {
      window.localStorage.removeItem(LEGACY_SETTINGS_STORAGE_KEY);
    }
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return sanitizeSettings(null);
    }
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return sanitizeSettings(null);
  }
}

export function saveSettings(settings: SessionSettings): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...settings,
        volumeCalibrationVersion: VOLUME_CALIBRATION_VERSION,
      }),
    );
  } catch {
    // Ignore storage quota or private-mode failures.
  }
}
