import type { ChoirVowel } from '../audio/choirSamples';
import type { DroneEngine } from '../audio/drone';
import { ChromaticDrone } from '../audio/drone';
import { getInstrumentPreset, isSampledTimbre } from '../audio/instruments';
import type { ChordVoiceHandle, SynthEngine } from '../audio/synth';
import { PolySynth } from '../audio/synth';
import {
  type ArrangementStrategy,
  defaultArrangementStrategy,
  type ScheduledNote,
} from '../music/arrangement';
import {
  CHORD_DEFS,
  getAllowedInversionsForChord,
  getInversionSuffixPhrases,
  getMajorKeyInfo,
  getScaleDegreePitchClass,
  getSpokenChordPhrase,
  getSpokenKeyPhrase,
} from '../music/chords';
import {
  generateProgressionWithInversions,
  getCandidateResolutionTargets,
  getOrientationChords,
  pickRandomKey,
  pickRandomNextKey,
} from '../music/generator';
import {
  generateProgressionMelody,
  melodyBarToScheduledNotes,
  type MelodyNoteEvent,
} from '../music/melody';
import {
  computeProgressionVoicePans,
  generateRandomVoicePans,
  getOrderedVoicePans,
  getSatbVoicePans,
} from '../music/panning';
import {
  defaultVoicingStrategy,
  type VoicedChord,
  type VoicingStrategy,
} from '../music/voicing';
import type {
  AmbienceMode,
  AudioOutputProfile,
  ChordId,
  ChordInversion,
  PitchClass,
  SessionSettings,
  TimbreId,
  VoicePanningMode,
} from '../types/settings';
import { HybridVoiceAnnouncer } from './hybridAnnouncer';
import { PocketManager, type PocketController } from './pocketManager';
import { type VoiceAnnouncer } from './speech';
import { WorkerClock, type SchedulerClock } from './workerTimer';

export type SessionPhase =
  | 'idle'
  | 'orienting_voice'
  | 'orienting_cadence'
  | 'inter_phase_pause'
  | 'question_playing'
  | 'repeat_pause'
  | 'pre_answer_pause'
  | 'answer_revealing'
  | 'post_answer_pause'
  | 'post_answer_replay'
  | 'next_question_pause';

export interface SessionSnapshot {
  phase: SessionPhase;
  isRunning: boolean;
  activeKey: PitchClass;
  questionNumber: number;
  currentPass: number;
  totalPasses: number;
  progression: ChordId[];
  progressionInversions: ChordInversion[];
  activeChordIndex: number;
  revealedCount: number;
  orientationStepIndex: number;
  orientationChords: ChordId[];
  wakeLockActive: boolean;
  speechAvailable: boolean;
}

interface VisualCue {
  audioTime: number;
  chordIndex: number;
  orientationStepIndex: number;
}

export interface SessionDependencies {
  synth?: SynthEngine;
  drone?: DroneEngine;
  announcer?: VoiceAnnouncer;
  clock?: SchedulerClock;
  pocket?: PocketController;
  voicingStrategy?: VoicingStrategy;
  arrangementStrategy?: ArrangementStrategy;
  rng?: () => number;
}

const SCHEDULE_AHEAD_SEC = 0.2;
const INTER_PHASE_PAUSE_SEC = 0.7;
const PRE_ANSWER_PAUSE_SEC = 0.6;
const POST_ANSWER_PAUSE_SEC = 0.55;
const NEXT_QUESTION_PAUSE_SEC = 1.1;
/** Minimum silent margin after a chord's release tail hits 0 before toggling the voice-pocket EQ. */
const EQ_SILENCE_MARGIN_SEC = 0.12;
/** Fast click-free time constant used when switching the EQ during silence (99.8% settled in 40ms). */
const SILENT_DUCK_TIME_CONSTANT_SEC = 0.006;

export class SessionController {
  private settings: SessionSettings;
  private readonly synth: SynthEngine;
  private readonly drone: DroneEngine;
  private readonly announcer: VoiceAnnouncer;
  private readonly clock: SchedulerClock;
  private readonly pocket: PocketController;
  private readonly voicingStrategy: VoicingStrategy;
  private readonly arrangementStrategy: ArrangementStrategy;
  private readonly rng: () => number;

  private listeners = new Set<(snapshot: SessionSnapshot) => void>();
  private unsubWakeLock: (() => void) | null = null;
  private unsubSynthState: (() => void) | null = null;

  private epoch = 0;
  private isRunning = false;
  private phase: SessionPhase = 'idle';
  private activeKey: PitchClass;
  private questionNumber = 0;
  private questionsInCurrentKey = 0;
  private currentPass = 1;
  private progression: ChordId[] = [];
  private progressionInversions: ChordInversion[] = [];
  private voicedProgression: VoicedChord[] = [];
  private progressionMelody: MelodyNoteEvent[][] = [];
  private progressionPans: [number, number, number, number][] = [];
  private progressionVowels: ChoirVowel[] = [];
  private previousQuestionEndVoicing: VoicedChord | undefined = undefined;

  private orientationChords: ChordId[] = [];
  private voicedOrientation: VoicedChord[] = [];
  private orientationPans: [number, number, number, number][] = [];
  private orientationVowels: ChoirVowel[] = [];
  private orientationDurations: number[] = [];
  private orientationStepIndex = -1;
  private previewSeq = 0;
  private lastPreviewVowel: ChoirVowel = 'ahh';

  private activeChordIndex = -1;
  private revealedCount = 0;
  private wakeLockActive = false;

  // Lookahead scheduling state
  private scheduleIndex = 0;
  private nextScheduleTime = 0;
  private phaseDeadlineTime = 0;
  private visualCues: VisualCue[] = [];

  // Orientation voice sync state
  private orientVoiceDoneAt: number | null = null;

  // Answer reveal speech-sync state
  private revealIndex = 0;
  private revealSlotMinEndTime = 0;
  private revealSpeechDone = false;
  private revealSpeechFinishedTime: number | null = null;
  private currentRevealVoice: ChordVoiceHandle | null = null;
  private currentRevealReleaseSec = 0;
  private lastQuestionReleaseSec = 0;
  private previewVoice: ChordVoiceHandle | null = null;

  private cloneSettings(source: SessionSettings): SessionSettings {
    const overridesCopy: Partial<Record<ChordId, ChordInversion[]>> = {};
    for (const [k, v] of Object.entries(source.chordInversionOverrides)) {
      if (v && v.length > 0) {
        overridesCopy[k as ChordId] = [...v];
      }
    }
    return {
      ...source,
      allowedChords: [...source.allowedChords],
      allowedSecondaryDominants: [...source.allowedSecondaryDominants],
      triadInversions: [...source.triadInversions],
      seventhInversions: [...source.seventhInversions],
      chordInversionOverrides: overridesCopy,
    };
  }

  constructor(initialSettings: SessionSettings, deps: SessionDependencies = {}) {
    this.settings = this.cloneSettings(initialSettings);
    this.activeKey = initialSettings.fixedKey;

    const ownsSynth = !deps.synth;
    const synthInstance = deps.synth ?? new PolySynth();
    this.synth = synthInstance;
    this.drone =
      deps.drone ??
      (ownsSynth
        ? new ChromaticDrone(synthInstance as PolySynth)
        : new ChromaticDrone(synthInstance as PolySynth));
    this.announcer =
      deps.announcer ??
      new HybridVoiceAnnouncer(
        synthInstance as PolySynth,
        initialSettings.voiceSource,
      );
    this.clock = deps.clock ?? new WorkerClock(25);
    this.pocket = deps.pocket ?? new PocketManager();
    this.voicingStrategy = deps.voicingStrategy ?? defaultVoicingStrategy;
    this.arrangementStrategy =
      deps.arrangementStrategy ?? defaultArrangementStrategy;
    this.rng = deps.rng ?? Math.random;

    this.synth.setMelodyVolume(this.settings.melodyVolume);
    this.synth.setOutputProfile?.(this.settings.outputProfile);
    if (this.settings.melodyEnabled) {
      void this.synth.preloadTimbre?.(this.settings.melodyTimbre);
    }

    this.wakeLockActive = this.pocket.isWakeLockActive();
    this.unsubWakeLock = this.pocket.onWakeLockChange((active) => {
      this.wakeLockActive = active;
      this.emit();
    });

    this.unsubSynthState = this.synth.onStateChange((state) => {
      if (this.isRunning && (state === 'suspended' || state === 'interrupted')) {
        void this.synth.ensureContext().then(() => {
          this.pocket.recoverAudioSession();
        });
      }
    });
  }

  getSnapshot(): SessionSnapshot {
    return {
      phase: this.phase,
      isRunning: this.isRunning,
      activeKey: this.activeKey,
      questionNumber: this.questionNumber,
      currentPass: this.currentPass,
      totalPasses: this.settings.questionRepeats,
      progression: [...this.progression],
      progressionInversions: [...this.progressionInversions],
      activeChordIndex: this.activeChordIndex,
      revealedCount: this.revealedCount,
      orientationStepIndex: this.orientationStepIndex,
      orientationChords: [...this.orientationChords],
      wakeLockActive: this.wakeLockActive,
      speechAvailable: this.announcer.isAvailable(),
    };
  }

  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private getSlotDurationSec(): number {
    return (60 / this.settings.bpm) * 4;
  }

  private resolveDronePitch(key: PitchClass): PitchClass {
    return getScaleDegreePitchClass(key, this.settings.droneScaleDegree);
  }

  private syncDrone(): void {
    if (!this.isRunning || !this.settings.droneEnabled) {
      this.drone.stop();
      return;
    }
    this.drone.start(
      this.resolveDronePitch(this.activeKey),
      this.settings.droneVolume,
      this.settings.droneOctave,
    );
  }

  private updateMediaMetadata(): void {
    const keyName = getMajorKeyInfo(this.activeKey).displayName;
    let title = `${keyName} · Ready`;
    if (this.phase === 'orienting_voice' || this.phase === 'orienting_cadence') {
      title = `Key of ${keyName}`;
    } else if (
      this.phase === 'question_playing' ||
      this.phase === 'repeat_pause' ||
      this.phase === 'pre_answer_pause'
    ) {
      title = `Q${this.questionNumber} · Pass ${this.currentPass}/${this.settings.questionRepeats}`;
    } else if (
      this.phase === 'answer_revealing' ||
      this.phase === 'post_answer_pause' ||
      this.phase === 'post_answer_replay' ||
      this.phase === 'next_question_pause'
    ) {
      title = this.progression
        .slice(0, Math.max(1, this.revealedCount))
        .map((id) => CHORD_DEFS[id].symbol)
        .join('-');
    }

    this.pocket.updateMetadata({
      title,
      artist: 'Paws Off',
      album: `${keyName} · ${this.settings.bpm} BPM`,
    });
  }

  private getPreloadPhrases(): string[] {
    const phrases = new Set<string>([getSpokenKeyPhrase(this.activeKey)]);
    let hasNonRootInversion = false;

    const addChord = (chordId: ChordId) => {
      phrases.add(
        getSpokenChordPhrase(
          chordId,
          this.settings.halfDimNaming,
          this.settings.announceTriadQuality,
        ).text,
      );
      if (
        getAllowedInversionsForChord(chordId, this.settings).some(
          (inv) => inv > 0,
        )
      ) {
        hasNonRootInversion = true;
      }
    };

    for (const chordId of this.settings.allowedChords) {
      addChord(chordId);
    }
    if (this.settings.secondaryDominantsEnabled) {
      for (const secDom of this.settings.allowedSecondaryDominants) {
        addChord(secDom);
        if (this.settings.strictSecondaryResolution) {
          for (const target of getCandidateResolutionTargets(
            secDom,
            this.settings.allowedChords,
          )) {
            addChord(target);
          }
        }
      }
    }
    if (hasNonRootInversion) {
      for (const suffix of getInversionSuffixPhrases(
        this.settings.inversionNotation,
      )) {
        phrases.add(suffix);
      }
    }
    return Array.from(phrases);
  }

  start(): void {
    if (this.isRunning) return;

    this.announcer.setMode?.(this.settings.voiceSource);
    // Must run synchronously inside user tap gesture for iOS/Android permissions.
    this.announcer.unlock();
    void this.synth.ensureContext();
    this.pocket.activate({
      onPlay: () => this.start(),
      onStop: () => this.stop(),
      onReplay: () => this.replayQuestion(),
      onSkip: () => this.skipToAnswer(),
    });

    this.epoch++;
    this.isRunning = true;
    this.questionNumber = 0;
    this.questionsInCurrentKey = 0;
    this.previousQuestionEndVoicing = undefined;
    this.progression = [];
    this.progressionInversions = [];
    this.voicedProgression = [];
    this.progressionMelody = [];
    this.activeChordIndex = -1;
    this.revealedCount = 0;
    this.orientationStepIndex = -1;
    this.visualCues = [];

    this.activeKey =
      this.settings.keyMode === 'auto-rotate'
        ? pickRandomKey(this.rng)
        : this.settings.fixedKey;

    this.previewVoice?.release(this.synth.getCurrentTime(), 0.04);
    this.previewVoice = null;

    this.announcer.preload?.(this.getPreloadPhrases());
    void this.synth.preloadTimbre?.(this.settings.timbre);
    if (this.settings.melodyEnabled) {
      void this.synth.preloadTimbre?.(this.settings.melodyTimbre);
    }
    this.synth.setChordVolume(this.settings.chordVolume);
    this.synth.setMelodyVolume(this.settings.melodyVolume);
    this.synth.setVoiceVolume(this.settings.voiceVolume);
    this.synth.setAmbience(this.settings.ambience);
    this.synth.setOutputProfile?.(this.settings.outputProfile);
    this.syncDrone();
    this.currentRevealReleaseSec = 0;
    this.lastQuestionReleaseSec = 0;
    this.synth.setDucked(
      false,
      this.synth.getCurrentTime(),
      SILENT_DUCK_TIME_CONSTANT_SEC,
    );

    this.clock.start(() => this.tick());
    this.beginNextQuestion(true);
  }

  stop(): void {
    if (!this.isRunning && this.phase === 'idle') return;

    this.epoch++;
    this.isRunning = false;
    this.clock.stop();
    this.announcer.cancel();
    this.previewVoice?.release(this.synth.getCurrentTime(), 0.04);
    this.previewVoice = null;
    this.currentRevealVoice?.release(this.synth.getCurrentTime(), 0.05);
    this.currentRevealVoice = null;
    this.currentRevealReleaseSec = 0;
    this.lastQuestionReleaseSec = 0;
    this.synth.releaseAll(0.05);
    this.synth.setDucked(false, this.synth.getCurrentTime());
    this.drone.stop();
    this.pocket.deactivate();

    this.phase = 'idle';
    this.activeChordIndex = -1;
    this.revealedCount = 0;
    this.orientationStepIndex = -1;
    this.orientationChords = [];
    this.visualCues = [];
    this.orientVoiceDoneAt = null;
    this.emit();
  }

  replayQuestion(): void {
    if (!this.isRunning || this.progression.length === 0) return;

    this.epoch++;
    this.announcer.cancel();
    this.previewVoice?.release(this.synth.getCurrentTime(), 0.04);
    this.previewVoice = null;
    this.currentRevealVoice?.release(this.synth.getCurrentTime(), 0.05);
    this.currentRevealVoice = null;
    this.currentRevealReleaseSec = 0;
    this.lastQuestionReleaseSec = 0;
    this.synth.releaseAll(0.05);
    this.synth.setDucked(false, this.synth.getCurrentTime());
    this.visualCues = [];
    this.orientVoiceDoneAt = null;
    this.orientationStepIndex = -1;

    this.currentPass = 1;
    this.revealedCount = 0;
    this.activeChordIndex = -1;
    this.beginQuestionPass(this.synth.getCurrentTime() + 0.06);
  }

  skipToAnswer(): void {
    if (!this.isRunning) return;

    const inOrPastReveal =
      this.phase === 'answer_revealing' ||
      this.phase === 'post_answer_pause' ||
      this.phase === 'post_answer_replay' ||
      this.phase === 'next_question_pause';

    this.epoch++;
    this.announcer.cancel();
    this.previewVoice?.release(this.synth.getCurrentTime(), 0.04);
    this.previewVoice = null;
    this.currentRevealVoice?.release(this.synth.getCurrentTime(), 0.05);
    this.currentRevealVoice = null;
    this.currentRevealReleaseSec = 0;
    this.lastQuestionReleaseSec = 0;
    this.synth.releaseAll(0.05);
    this.synth.setDucked(false, this.synth.getCurrentTime());
    this.visualCues = [];
    this.orientVoiceDoneAt = null;
    this.orientationStepIndex = -1;

    if (inOrPastReveal) {
      this.advanceAfterQuestionCompleted();
      return;
    }

    if (this.progression.length === 0) {
      this.generateQuestionData();
    }
    this.beginAnswerReveal(this.synth.getCurrentTime());
  }

  private pickRandomVowel(): ChoirVowel {
    return this.rng() < 0.5 ? 'ooh' : 'ahh';
  }

  private applyVoiceStyling(
    notes: ScheduledNote[],
    randomPans?: readonly number[],
    vowel?: ChoirVowel,
    enabled = this.settings.voicePanning,
    mode: VoicePanningMode = this.settings.voicePanningMode,
  ): ScheduledNote[] {
    if (!enabled) {
      return notes.map((note) => ({ ...note, pan: 0, vowel }));
    }
    const chordCount = notes.filter((note) => note.role !== 'melody').length;
    const targetPans =
      mode === 'random' && randomPans
        ? randomPans
        : mode === 'satb'
          ? getSatbVoicePans(chordCount)
          : getOrderedVoicePans(chordCount);
    let chordCursor = 0;
    return notes.map((note) => {
      if (note.role === 'melody') {
        return { ...note, pan: 0, vowel };
      }
      const pan = targetPans[chordCursor] ?? 0;
      chordCursor++;
      return { ...note, pan, vowel };
    });
  }

  previewSound(
    timbre?: TimbreId,
    ambience?: AmbienceMode,
    voicePanning?: boolean,
    voicePanningMode?: VoicePanningMode,
    outputProfile?: AudioOutputProfile,
  ): void {
    if (this.isRunning) return;

    const targetTimbre = timbre ?? this.settings.timbre;
    const targetAmbience = ambience ?? this.settings.ambience;
    const targetPanning = voicePanning ?? this.settings.voicePanning;
    const targetPanningMode =
      voicePanningMode ?? this.settings.voicePanningMode;
    const targetOutputProfile = outputProfile ?? this.settings.outputProfile;

    // Alternate Ooh and Ahh on successive idle previews so users hear both
    const previewVowel: ChoirVowel =
      this.lastPreviewVowel === 'ooh' ? 'ahh' : 'ooh';
    this.lastPreviewVowel = previewVowel;

    const seq = ++this.previewSeq;
    void this.synth.ensureContext();

    const triggerPreview = () => {
      if (this.isRunning || seq !== this.previewSeq) return;
      const now = this.synth.getCurrentTime();
      this.previewVoice?.release(now, 0.05);
      this.previewVoice = null;

      this.synth.setDucked(false, now);
      this.synth.setChordVolume(this.settings.chordVolume);
      this.synth.setAmbience(targetAmbience);
      this.synth.setOutputProfile?.(targetOutputProfile);

      const voiced = this.voicingStrategy.voiceSequence(
        ['Imaj7'],
        this.settings.fixedKey,
      )[0];
      if (!voiced) return;

      const rollStepSec = getInstrumentPreset(targetTimbre).rollStepSec;
      const baseNotes = this.arrangementStrategy.arrangeChord(
        voiced,
        1.55,
        rollStepSec,
      );
      const previewPans =
        targetPanning && targetPanningMode === 'random'
          ? generateRandomVoicePans(baseNotes.length, this.rng)
          : undefined;
      const notes = this.applyVoiceStyling(
        baseNotes,
        previewPans,
        previewVowel,
        targetPanning,
        targetPanningMode,
      );
      this.previewVoice = this.synth.playChord(notes, now + 0.025, targetTimbre);
    };

    if (isSampledTimbre(targetTimbre) && this.synth.preloadTimbre) {
      void this.synth.preloadTimbre(targetTimbre).finally(triggerPreview);
    } else {
      triggerPreview();
    }
  }

  previewMelodySound(timbre?: TimbreId): void {
    if (this.isRunning) return;

    const targetTimbre = timbre ?? this.settings.melodyTimbre;
    const previewVowel: ChoirVowel =
      this.lastPreviewVowel === 'ooh' ? 'ahh' : 'ooh';
    this.lastPreviewVowel = previewVowel;

    const seq = ++this.previewSeq;
    void this.synth.ensureContext();

    const triggerPreview = () => {
      if (this.isRunning || seq !== this.previewSeq) return;
      const now = this.synth.getCurrentTime();
      this.previewVoice?.release(now, 0.05);
      this.previewVoice = null;

      this.synth.setDucked(false, now);
      this.synth.setMelodyVolume(this.settings.melodyVolume);
      this.synth.setAmbience(this.settings.ambience);
      this.synth.setOutputProfile?.(this.settings.outputProfile);

      const tonicMidi = 72 + this.settings.fixedKey;
      const notes: ScheduledNote[] = [
        {
          midi: tonicMidi,
          offsetSec: 0,
          durationSec: 0.2,
          velocity: 0.9,
          role: 'melody',
          timbre: targetTimbre,
          pan: 0,
          vowel: previewVowel,
        },
        {
          midi: tonicMidi + 4,
          offsetSec: 0.22,
          durationSec: 0.2,
          velocity: 0.88,
          role: 'melody',
          timbre: targetTimbre,
          pan: 0,
          vowel: previewVowel,
        },
        {
          midi: tonicMidi + 7,
          offsetSec: 0.44,
          durationSec: 0.55,
          velocity: 0.94,
          role: 'melody',
          timbre: targetTimbre,
          pan: 0,
          vowel: previewVowel,
        },
      ];
      this.previewVoice = this.synth.playChord(notes, now + 0.025, targetTimbre);
    };

    if (isSampledTimbre(targetTimbre) && this.synth.preloadTimbre) {
      void this.synth.preloadTimbre(targetTimbre).finally(triggerPreview);
    } else {
      triggerPreview();
    }
  }

  updateSettings(next: SessionSettings): void {
    const prev = this.settings;
    this.settings = this.cloneSettings(next);
    this.announcer.setMode?.(next.voiceSource);
    this.synth.setChordVolume(next.chordVolume);
    this.synth.setMelodyVolume(next.melodyVolume);
    this.synth.setVoiceVolume(next.voiceVolume);
    this.synth.setAmbience(next.ambience);
    this.synth.setOutputProfile?.(next.outputProfile);
    void this.synth.preloadTimbre?.(next.timbre);
    if (next.melodyEnabled) {
      void this.synth.preloadTimbre?.(next.melodyTimbre);
    }

    if (!this.isRunning) {
      this.activeKey = next.fixedKey;
      this.emit();
      return;
    }

    if (
      next.melodyEnabled &&
      (!prev.melodyEnabled ||
        next.melodyAllowTensions !== prev.melodyAllowTensions) &&
      this.voicedProgression.length > 0
    ) {
      this.progressionMelody = generateProgressionMelody(
        this.voicedProgression,
        this.activeKey,
        {
          allowTensions: next.melodyAllowTensions,
          rng: this.rng,
        },
      );
    } else if (!next.melodyEnabled) {
      this.progressionMelody = [];
    }

    this.announcer.preload?.(this.getPreloadPhrases());

    // Update live drone parameters immediately
    if (next.droneEnabled) {
      if (!prev.droneEnabled) {
        this.drone.start(
          this.resolveDronePitch(this.activeKey),
          next.droneVolume,
          next.droneOctave,
        );
      } else {
        this.drone.setPitch(
          this.resolveDronePitch(this.activeKey),
          next.droneOctave,
        );
        this.drone.setVolume(next.droneVolume);
      }
    } else if (prev.droneEnabled) {
      this.drone.stop();
    }

    // Update ducking live if currently revealing answer
    if (this.phase === 'answer_revealing') {
      this.synth.setDucked(next.playChordsBehindAnswer, this.synth.getCurrentTime());
    }

    // If fixed key changed while running in fixed mode, or switched into fixed mode with a new key
    if (next.keyMode === 'fixed' && next.fixedKey !== this.activeKey) {
      this.epoch++;
      this.announcer.cancel();
      this.currentRevealVoice?.release(this.synth.getCurrentTime(), 0.05);
      this.currentRevealVoice = null;
      this.currentRevealReleaseSec = 0;
      this.lastQuestionReleaseSec = 0;
      this.synth.releaseAll(0.05);
      this.synth.setDucked(false, this.synth.getCurrentTime());
      this.visualCues = [];
      this.activeKey = next.fixedKey;
      this.questionsInCurrentKey = 0;
      this.syncDrone();
      this.generateQuestionData();
      if (this.settings.keyOrientation !== 'none') {
        this.beginKeyOrientation();
      } else {
        this.beginQuestionPass(this.synth.getCurrentTime() + 0.06);
      }
      return;
    }

    this.emit();
  }

  private advanceAfterQuestionCompleted(): void {
    this.questionsInCurrentKey++;
    const shouldRotate =
      this.settings.keyMode === 'auto-rotate' &&
      this.questionsInCurrentKey >= this.settings.rotateEveryNQuestions;

    if (shouldRotate) {
      this.activeKey = pickRandomNextKey(this.activeKey, this.rng);
      this.questionsInCurrentKey = 0;
      this.previousQuestionEndVoicing = undefined;
      if (this.settings.droneEnabled) {
        this.drone.setPitch(
          this.resolveDronePitch(this.activeKey),
          this.settings.droneOctave,
        );
      }
    }

    this.beginNextQuestion(shouldRotate);
  }

  private generateQuestionData(): void {
    const activeSecondaryDominants = this.settings.secondaryDominantsEnabled
      ? this.settings.allowedSecondaryDominants
      : [];
    const generated = generateProgressionWithInversions(
      this.settings.allowedChords,
      this.settings.progressionLength,
      (chordId) => getAllowedInversionsForChord(chordId, this.settings),
      this.activeKey,
      this.settings.musicalInversionLeading,
      this.progression.length > 0 ? this.progression : undefined,
      this.rng,
      activeSecondaryDominants,
      this.settings.strictSecondaryResolution,
    );
    this.progression = generated.map((item) => item.chordId);
    this.progressionInversions = generated.map((item) => item.inversion);
    this.voicedProgression = this.voicingStrategy.voiceSequence(
      generated,
      this.activeKey,
      this.previousQuestionEndVoicing,
      this.settings.melodyEnabled
        ? { maxUpperMidi: 72, upperCenterTarget: 63 }
        : undefined,
    );
    this.progressionMelody = this.settings.melodyEnabled
      ? generateProgressionMelody(this.voicedProgression, this.activeKey, {
          allowTensions: this.settings.melodyAllowTensions,
          rng: this.rng,
        })
      : [];
    this.progressionPans = computeProgressionVoicePans(
      this.voicedProgression,
      this.rng,
    );
    this.progressionVowels = this.voicedProgression.map(() =>
      this.pickRandomVowel(),
    );
    this.previousQuestionEndVoicing =
      this.voicedProgression[this.voicedProgression.length - 1];
    this.currentPass = 1;
    this.revealedCount = 0;
    this.activeChordIndex = -1;
  }

  private beginNextQuestion(orientKey: boolean): void {
    this.questionNumber++;
    this.generateQuestionData();

    if (orientKey && this.settings.keyOrientation !== 'none') {
      this.beginKeyOrientation();
    } else {
      this.beginQuestionPass(this.synth.getCurrentTime() + 0.06);
    }
  }

  private beginKeyOrientation(): void {
    this.orientationChords = getOrientationChords(this.settings.keyOrientation);
    if (this.orientationChords.length === 0) {
      this.beginQuestionPass(this.synth.getCurrentTime() + 0.06);
      return;
    }

    this.voicedOrientation = this.voicingStrategy.voiceSequence(
      this.orientationChords,
      this.activeKey,
    );
    this.orientationPans = computeProgressionVoicePans(
      this.voicedOrientation,
      this.rng,
    );
    this.orientationVowels = this.voicedOrientation.map(() =>
      this.pickRandomVowel(),
    );
    if (this.orientationChords.length === 4) {
      const baseBeat = Math.min(0.85, Math.max(0.55, 60 / this.settings.bpm));
      this.orientationDurations = [
        baseBeat,
        baseBeat,
        baseBeat,
        baseBeat * 1.5,
      ];
    } else {
      this.orientationDurations = [1.2];
    }

    this.orientationStepIndex = -1;
    this.activeChordIndex = -1;
    this.revealedCount = 0;
    this.orientVoiceDoneAt = null;

    this.synth.setDucked(
      false,
      this.synth.getCurrentTime(),
      SILENT_DUCK_TIME_CONSTANT_SEC,
    );

    if (this.announcer.isAvailable()) {
      this.phase = 'orienting_voice';
      this.updateMediaMetadata();
      this.emit();

      const capturedEpoch = this.epoch;
      const keySpoken = getSpokenKeyPhrase(this.activeKey);
      this.announcer.speak(keySpoken, {
        rate: this.settings.speechRate,
        voiceURI: this.settings.speechVoiceURI,
        estimatedSyllables: 6,
        volume: this.settings.voiceVolume,
        onEnd: () => {
          if (capturedEpoch !== this.epoch || !this.isRunning) return;
          this.pocket.recoverAudioSession();
          this.orientVoiceDoneAt = this.synth.getCurrentTime();
        },
      });
    } else {
      this.beginOrientationCadence(this.synth.getCurrentTime() + 0.05);
    }
  }

  private beginOrientationCadence(startTime: number): void {
    this.phase = 'orienting_cadence';
    this.scheduleIndex = 0;
    this.nextScheduleTime = startTime;
    this.visualCues = [];
    this.orientationStepIndex = -1;
    this.synth.setDucked(
      false,
      this.synth.getCurrentTime(),
      SILENT_DUCK_TIME_CONSTANT_SEC,
    );
    this.updateMediaMetadata();
    this.emit();
    this.scheduleAvailableChords(this.synth.getCurrentTime());
  }

  private beginQuestionPass(startTime: number): void {
    this.phase = 'question_playing';
    this.scheduleIndex = 0;
    this.nextScheduleTime = startTime;
    this.visualCues = [];
    this.orientationStepIndex = -1;
    this.activeChordIndex = -1;
    this.synth.setDucked(
      false,
      this.synth.getCurrentTime(),
      SILENT_DUCK_TIME_CONSTANT_SEC,
    );
    this.updateMediaMetadata();
    this.emit();
    this.scheduleAvailableChords(this.synth.getCurrentTime());
  }

  private beginPostAnswerReplay(startTime: number): void {
    this.phase = 'post_answer_replay';
    this.scheduleIndex = 0;
    this.nextScheduleTime = startTime;
    this.visualCues = [];
    this.activeChordIndex = -1;
    this.revealedCount = this.progression.length;
    this.synth.setDucked(
      false,
      this.synth.getCurrentTime(),
      SILENT_DUCK_TIME_CONSTANT_SEC,
    );
    this.updateMediaMetadata();
    this.emit();
    this.scheduleAvailableChords(this.synth.getCurrentTime());
  }

  private beginAnswerReveal(now: number): void {
    this.phase = 'answer_revealing';
    this.revealIndex = 0;
    this.revealedCount = 0;
    this.activeChordIndex = -1;
    this.visualCues = [];
    this.currentRevealReleaseSec = 0;

    if (this.settings.playChordsBehindAnswer) {
      this.synth.setDucked(true, now, SILENT_DUCK_TIME_CONSTANT_SEC);
    }

    this.startRevealStep(0, now);
  }

  private startRevealStep(index: number, now: number): void {
    const tStart = now + 0.04;
    if (this.currentRevealVoice) {
      this.currentRevealVoice.release(tStart);
      this.currentRevealVoice = null;
    }

    const chordId = this.progression[index];
    const inversion = this.progressionInversions[index] ?? 0;
    const { text, estimatedSyllables } = getSpokenChordPhrase(
      chordId,
      this.settings.halfDimNaming,
      this.settings.announceTriadQuality,
      inversion,
      this.settings.inversionNotation,
    );

    const baseSlotSec = this.getSlotDurationSec();
    const estSec = this.announcer.estimateDurationSec(
      estimatedSyllables,
      this.settings.speechRate,
      text,
    );
    const maxBoosted = Math.max(this.settings.speechRate, 1.35);
    // Keep recorded voice clips at exact natural pitch/rate (chord sustains
    // cleanly until speech finishes); only gently speed up pitch-preserving TTS.
    const effectiveRate =
      this.settings.voiceSource === 'speech-synthesis' && estSec > baseSlotSec
        ? Math.min(this.settings.speechRate * 1.15, maxBoosted)
        : this.settings.speechRate;

    if (this.settings.playChordsBehindAnswer) {
      const preset = getInstrumentPreset(this.settings.timbre);
      const notes = this.applyVoiceStyling(
        this.arrangementStrategy.arrangeChord(
          this.voicedProgression[index],
          null,
          preset.rollStepSec,
        ),
        this.progressionPans[index],
        this.progressionVowels[index],
      );
      this.currentRevealVoice = this.synth.playChord(
        notes,
        tStart,
        this.settings.timbre,
      );
      this.currentRevealReleaseSec = preset.defaultReleaseSec;
    } else {
      this.currentRevealReleaseSec = 0;
    }

    this.revealIndex = index;
    this.revealedCount = index + 1;
    this.activeChordIndex = index;
    this.revealSlotMinEndTime = tStart + baseSlotSec;

    this.updateMediaMetadata();
    this.emit();

    if (this.announcer.isAvailable()) {
      this.revealSpeechDone = false;
      this.revealSpeechFinishedTime = null;
      const capturedEpoch = this.epoch;
      this.announcer.speak(text, {
        rate: effectiveRate,
        voiceURI: this.settings.speechVoiceURI,
        estimatedSyllables,
        volume: this.settings.voiceVolume,
        onEnd: () => {
          if (capturedEpoch !== this.epoch || !this.isRunning) return;
          this.pocket.recoverAudioSession();
          this.revealSpeechDone = true;
          this.revealSpeechFinishedTime = this.synth.getCurrentTime();
        },
      });
    } else {
      this.revealSpeechDone = true;
      this.revealSpeechFinishedTime = null;
    }
  }

  private scheduleAvailableChords(now: number): void {
    const rollStepSec = getInstrumentPreset(this.settings.timbre).rollStepSec;

    if (this.phase === 'orienting_cadence') {
      while (
        this.scheduleIndex < this.voicedOrientation.length &&
        this.nextScheduleTime <= now + SCHEDULE_AHEAD_SEC
      ) {
        const dur = this.orientationDurations[this.scheduleIndex];
        const notes = this.applyVoiceStyling(
          this.arrangementStrategy.arrangeChord(
            this.voicedOrientation[this.scheduleIndex],
            dur,
            rollStepSec,
          ),
          this.orientationPans[this.scheduleIndex],
          this.orientationVowels[this.scheduleIndex],
        );
        this.synth.playChord(notes, this.nextScheduleTime, this.settings.timbre);
        this.visualCues.push({
          audioTime: this.nextScheduleTime,
          chordIndex: -1,
          orientationStepIndex: this.scheduleIndex,
        });
        this.nextScheduleTime += dur;
        this.scheduleIndex++;
      }
      return;
    }

    if (
      this.phase === 'question_playing' ||
      this.phase === 'post_answer_replay'
    ) {
      const preset = getInstrumentPreset(this.settings.timbre);
      const slotDur = this.getSlotDurationSec();
      while (
        this.scheduleIndex < this.voicedProgression.length &&
        this.nextScheduleTime <= now + SCHEDULE_AHEAD_SEC
      ) {
        const chordNotes = this.arrangementStrategy.arrangeChord(
          this.voicedProgression[this.scheduleIndex],
          slotDur,
          preset.rollStepSec,
          this.settings.melodyEnabled,
        );
        const melodyEvents = this.settings.melodyEnabled
          ? (this.progressionMelody[this.scheduleIndex] ?? [])
          : [];
        const melodyNotes =
          melodyEvents.length > 0
            ? melodyBarToScheduledNotes(
                melodyEvents,
                slotDur,
                this.settings.melodyTimbre,
                this.progressionVowels[this.scheduleIndex],
              )
            : [];
        const notes = this.applyVoiceStyling(
          [...chordNotes, ...melodyNotes],
          this.progressionPans[this.scheduleIndex],
          this.progressionVowels[this.scheduleIndex],
        );
        this.synth.playChord(notes, this.nextScheduleTime, this.settings.timbre);
        if (this.phase === 'question_playing') {
          this.lastQuestionReleaseSec = this.settings.melodyEnabled
            ? Math.max(
                preset.defaultReleaseSec,
                getInstrumentPreset(this.settings.melodyTimbre).defaultReleaseSec,
              )
            : preset.defaultReleaseSec;
        }
        this.visualCues.push({
          audioTime: this.nextScheduleTime,
          chordIndex: this.scheduleIndex,
          orientationStepIndex: -1,
        });
        this.nextScheduleTime += slotDur;
        this.scheduleIndex++;
      }
    }
  }

  syncVisualCues(): void {
    if (!this.isRunning || this.visualCues.length === 0) return;
    const now = this.synth.getCurrentTime();
    let changed = false;

    while (
      this.visualCues.length > 0 &&
      this.visualCues[0].audioTime <= now + 0.015
    ) {
      const cue = this.visualCues.shift()!;
      if (
        this.activeChordIndex !== cue.chordIndex ||
        this.orientationStepIndex !== cue.orientationStepIndex
      ) {
        this.activeChordIndex = cue.chordIndex;
        this.orientationStepIndex = cue.orientationStepIndex;
        changed = true;
      }
    }

    if (changed) {
      this.emit();
    }
  }

  tick(): void {
    if (!this.isRunning) return;
    const now = this.synth.getCurrentTime();
    this.syncVisualCues();

    switch (this.phase) {
      case 'orienting_voice': {
        if (
          this.orientVoiceDoneAt !== null &&
          now >= this.orientVoiceDoneAt + 0.15
        ) {
          this.orientVoiceDoneAt = null;
          this.beginOrientationCadence(now + 0.04);
        }
        break;
      }

      case 'orienting_cadence': {
        this.scheduleAvailableChords(now);
        if (
          this.scheduleIndex >= this.voicedOrientation.length &&
          now >= this.nextScheduleTime
        ) {
          this.orientationStepIndex = -1;
          this.phase = 'inter_phase_pause';
          this.phaseDeadlineTime = now + INTER_PHASE_PAUSE_SEC;
          this.emit();
        }
        break;
      }

      case 'inter_phase_pause': {
        if (now >= this.phaseDeadlineTime) {
          this.beginQuestionPass(now + 0.04);
        }
        break;
      }

      case 'question_playing': {
        this.scheduleAvailableChords(now);
        if (
          this.scheduleIndex >= this.voicedProgression.length &&
          now >= this.nextScheduleTime
        ) {
          this.activeChordIndex = -1;
          if (this.currentPass < this.settings.questionRepeats) {
            this.phase = 'repeat_pause';
            this.phaseDeadlineTime = now + this.settings.repeatPauseSec;
          } else {
            this.phase = 'pre_answer_pause';
            this.phaseDeadlineTime =
              now +
              Math.max(
                PRE_ANSWER_PAUSE_SEC,
                this.lastQuestionReleaseSec + EQ_SILENCE_MARGIN_SEC,
              );
          }
          this.emit();
        }
        break;
      }

      case 'repeat_pause': {
        if (now >= this.phaseDeadlineTime) {
          this.currentPass++;
          this.beginQuestionPass(now + 0.04);
        }
        break;
      }

      case 'pre_answer_pause': {
        if (now >= this.phaseDeadlineTime) {
          this.beginAnswerReveal(now);
        }
        break;
      }

      case 'answer_revealing': {
        if (!this.revealSpeechDone) return;
        const speechReady =
          this.revealSpeechFinishedTime !== null
            ? this.revealSpeechFinishedTime + 0.12
            : 0;
        const advanceAt = Math.max(this.revealSlotMinEndTime, speechReady);
        if (now < advanceAt) return;

        if (this.revealIndex + 1 < this.progression.length) {
          this.startRevealStep(this.revealIndex + 1, now);
        } else {
          if (this.currentRevealVoice) {
            this.currentRevealVoice.release(now);
            this.currentRevealVoice = null;
          }
          // Keep the voice-pocket EQ engaged while the last answer chord fades
          // out; it lifts cleanly in the silence right before the next chord.
          const releaseClearance =
            this.currentRevealReleaseSec > 0
              ? this.currentRevealReleaseSec + EQ_SILENCE_MARGIN_SEC
              : 0;
          this.currentRevealReleaseSec = 0;
          this.activeChordIndex = -1;

          if (this.settings.playFinalReplayAfterAnswer) {
            this.phase = 'post_answer_pause';
            this.phaseDeadlineTime =
              now + Math.max(POST_ANSWER_PAUSE_SEC, releaseClearance);
          } else {
            this.phase = 'next_question_pause';
            this.phaseDeadlineTime =
              now + Math.max(NEXT_QUESTION_PAUSE_SEC, releaseClearance);
          }
          this.emit();
        }
        break;
      }

      case 'post_answer_pause': {
        if (now >= this.phaseDeadlineTime) {
          this.beginPostAnswerReplay(now + 0.04);
        }
        break;
      }

      case 'post_answer_replay': {
        this.scheduleAvailableChords(now);
        if (
          this.scheduleIndex >= this.voicedProgression.length &&
          now >= this.nextScheduleTime
        ) {
          this.activeChordIndex = -1;
          this.phase = 'next_question_pause';
          this.phaseDeadlineTime = now + NEXT_QUESTION_PAUSE_SEC;
          this.emit();
        }
        break;
      }

      case 'next_question_pause': {
        if (now >= this.phaseDeadlineTime) {
          this.advanceAfterQuestionCompleted();
        }
        break;
      }

      case 'idle':
        break;
    }
  }

  dispose(): void {
    this.stop();
    this.unsubWakeLock?.();
    this.unsubSynthState?.();
    this.clock.dispose();
    this.announcer.dispose();
    this.drone.dispose();
    this.synth.dispose();
    this.pocket.dispose();
    this.listeners.clear();
  }
}
