import { describe, expect, it, vi } from 'vitest';
import type { DroneEngine } from '../../audio/drone';
import type { ChordVoiceHandle, SynthEngine } from '../../audio/synth';
import type { ScheduledNote } from '../../music/arrangement';
import {
  DEFAULT_SETTINGS,
  type AmbienceMode,
  type AudioOutputProfile,
  type DroneOctave,
  type PitchClass,
  type SessionSettings,
  type TimbreId,
} from '../../types/settings';
import type { PocketController, PocketHandlers } from '../pocketManager';
import {
  SessionController,
  type SessionSnapshot,
} from '../sessionController';
import type { SpeakOptions, VoiceAnnouncer } from '../speech';
import type { SchedulerClock } from '../workerTimer';

interface RecordedChord {
  notes: readonly ScheduledNote[];
  startTime: number;
  timbre: TimbreId;
  releasedAt: number | null;
  duckedWhenStarted: boolean;
}

class FakeSynth implements SynthEngine {
  currentTime = 0;
  ducked = false;
  duckEvents: {
    ducked: boolean;
    atTime?: number;
    timeConstantSec?: number;
    currentTime: number;
  }[] = [];
  chordVolume = 0.75;
  melodyVolume = 0.5;
  voiceVolume = 0.65;
  ambience: AmbienceMode = 'warm-room';
  outputProfile: AudioOutputProfile = 'auto';
  chords: RecordedChord[] = [];
  releaseAllCount = 0;
  private stateListeners = new Set<(s: string) => void>();

  async ensureContext(): Promise<void> {}

  getCurrentTime(): number {
    return this.currentTime;
  }

  getContextState(): string {
    return 'running';
  }

  playChord(
    notes: readonly ScheduledNote[],
    startTime: number,
    timbre: TimbreId,
  ): ChordVoiceHandle {
    const entry: RecordedChord = {
      notes,
      startTime,
      timbre,
      releasedAt: null,
      duckedWhenStarted: this.ducked,
    };
    this.chords.push(entry);
    return {
      release: (atTime: number) => {
        if (entry.releasedAt === null) {
          entry.releasedAt = atTime;
        }
      },
    };
  }

  releaseAll(): void {
    this.releaseAllCount++;
  }

  setDucked(
    ducked: boolean,
    atTime?: number,
    timeConstantSec?: number,
  ): void {
    this.ducked = ducked;
    this.duckEvents.push({
      ducked,
      atTime,
      timeConstantSec,
      currentTime: this.currentTime,
    });
  }

  setChordVolume(volume: number): void {
    this.chordVolume = volume;
  }

  setMelodyVolume(volume: number): void {
    this.melodyVolume = volume;
  }

  setVoiceVolume(volume: number): void {
    this.voiceVolume = volume;
  }

  setAmbience(mode: AmbienceMode): void {
    this.ambience = mode;
  }

  setOutputProfile(profile: AudioOutputProfile): void {
    this.outputProfile = profile;
  }

  onStateChange(cb: (state: string) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  dispose(): void {}
}

class FakeDrone implements DroneEngine {
  active = false;
  pitch: PitchClass = 0;
  octave: DroneOctave = 0;
  volume = 0;
  pitchHistory: PitchClass[] = [];

  start(pitch: PitchClass, volume: number, octave: DroneOctave = 0): void {
    this.active = true;
    this.pitch = pitch;
    this.octave = octave;
    this.volume = volume;
    this.pitchHistory.push(pitch);
  }

  stop(): void {
    this.active = false;
  }

  setPitch(pitch: PitchClass, octave: DroneOctave = this.octave): void {
    this.pitch = pitch;
    this.octave = octave;
    this.pitchHistory.push(pitch);
  }

  setVolume(volume: number): void {
    this.volume = volume;
  }

  dispose(): void {}
}

interface PendingSpeech {
  text: string;
  options: SpeakOptions;
  cancelled: boolean;
  finished: boolean;
}

class FakeAnnouncer implements VoiceAnnouncer {
  available = true;
  unlockCalls = 0;
  cancelCalls = 0;
  spoken: PendingSpeech[] = [];
  customEstimateSec: number | null = null;

  isAvailable(): boolean {
    return this.available;
  }

  unlock(): void {
    this.unlockCalls++;
  }

  getVoices() {
    return [];
  }

  onVoicesChanged(): () => void {
    return () => {};
  }

  estimateDurationSec(syllables: number, rate: number): number {
    if (this.customEstimateSec !== null) return this.customEstimateSec;
    return (0.24 + syllables * 0.19) / rate;
  }

  speak(text: string, options: SpeakOptions): void {
    this.spoken.push({
      text,
      options,
      cancelled: false,
      finished: false,
    });
  }

  finishLatest(): PendingSpeech | undefined {
    const latest = this.spoken[this.spoken.length - 1];
    if (latest && !latest.finished) {
      latest.finished = true;
      latest.options.onStart?.();
      latest.options.onEnd?.();
    }
    return latest;
  }

  cancel(): void {
    this.cancelCalls++;
    const latest = this.spoken[this.spoken.length - 1];
    if (latest && !latest.finished) {
      latest.cancelled = true;
    }
  }

  dispose(): void {}
}

class FakeClock implements SchedulerClock {
  running = false;
  private onTick: (() => void) | null = null;

  start(onTick: () => void): void {
    this.running = true;
    this.onTick = onTick;
  }

  stop(): void {
    this.running = false;
    this.onTick = null;
  }

  tick(): void {
    if (this.running) {
      this.onTick?.();
    }
  }

  dispose(): void {
    this.stop();
  }
}

class FakePocket implements PocketController {
  active = false;
  handlers: PocketHandlers | null = null;
  recoverCalls = 0;
  metadataTitles: string[] = [];

  activate(handlers: PocketHandlers): void {
    this.active = true;
    this.handlers = handlers;
  }

  deactivate(): void {
    this.active = false;
  }

  updateMetadata(metadata: { title: string }): void {
    this.metadataTitles.push(metadata.title);
  }

  recoverAudioSession(): void {
    this.recoverCalls++;
  }

  isWakeLockActive(): boolean {
    return this.active;
  }

  onWakeLockChange(): () => void {
    return () => {};
  }

  dispose(): void {}
}

function advanceAndTick(
  synth: FakeSynth,
  clock: FakeClock,
  totalSec: number,
  stepSec = 0.05,
): void {
  const steps = Math.ceil(totalSec / stepSec);
  for (let i = 0; i < steps; i++) {
    synth.currentTime += stepSec;
    clock.tick();
  }
}

function createHarness(
  overrides: Partial<SessionSettings> = {},
  rngSeq?: number[],
) {
  let rngIdx = 0;
  const rng = rngSeq
    ? () => {
        const val = rngSeq[rngIdx % rngSeq.length];
        rngIdx++;
        return val;
      }
    : () => 0.2;

  const settings: SessionSettings = {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
  const synth = new FakeSynth();
  const drone = new FakeDrone();
  const announcer = new FakeAnnouncer();
  const clock = new FakeClock();
  const pocket = new FakePocket();

  const controller = new SessionController(settings, {
    synth,
    drone,
    announcer,
    clock,
    pocket,
    rng,
  });

  const snapshots: SessionSnapshot[] = [];
  controller.subscribe((s) => snapshots.push(s));

  return { controller, synth, drone, announcer, clock, pocket, snapshots };
}

describe('SessionController state machine & scheduler', () => {
  it('runs the complete hands-free loop: orientation -> N repeats -> answer reveal -> auto-advance', () => {
    const { controller, synth, announcer, clock, pocket } = createHarness({
      allowedChords: ['I', 'IV', 'V', 'vi'],
      bpm: 120, // 4 beats per chord -> 2.0s per chord
      progressionLength: 2,
      questionRepeats: 2,
      repeatPauseSec: 1.0,
      keyMode: 'fixed',
      fixedKey: 0,
      keyOrientation: 'cadence',
    });

    controller.start();
    expect(announcer.unlockCalls).toBe(1);
    expect(pocket.active).toBe(true);
    expect(controller.getSnapshot().phase).toBe('orienting_voice');
    expect(announcer.spoken[0].text).toBe('Key of C major');

    // Finish orientation speech
    announcer.finishLatest();
    advanceAndTick(synth, clock, 0.25);
    expect(controller.getSnapshot().phase).toBe('orienting_cadence');

    // Finish I-IV-V-I cadence (4 chords: 3 * 0.55 + 0.825 = 2.475s)
    advanceAndTick(synth, clock, 2.6);
    expect(controller.getSnapshot().phase).toBe('inter_phase_pause');

    // Finish inter-phase pause -> Pass 1
    advanceAndTick(synth, clock, 0.8);
    expect(controller.getSnapshot().phase).toBe('question_playing');
    expect(controller.getSnapshot().currentPass).toBe(1);
    expect(controller.getSnapshot().revealedCount).toBe(0);

    // Finish Pass 1 (2 chords * 2.0s = 4.0s)
    advanceAndTick(synth, clock, 4.15);
    expect(controller.getSnapshot().phase).toBe('repeat_pause');

    // Finish repeat pause (1.0s) -> Pass 2
    advanceAndTick(synth, clock, 1.1);
    expect(controller.getSnapshot().phase).toBe('question_playing');
    expect(controller.getSnapshot().currentPass).toBe(2);

    // Finish Pass 2 (4.0s) -> pre_answer_pause (clears 0.55s release + silence) -> answer_revealing
    advanceAndTick(synth, clock, 4.8);
    expect(controller.getSnapshot().phase).toBe('answer_revealing');
    expect(synth.ducked).toBe(true);
    expect(controller.getSnapshot().revealedCount).toBe(1);

    // Finish 1st answer chord speech & 2.0s grid wait
    announcer.finishLatest();
    advanceAndTick(synth, clock, 2.0);
    expect(controller.getSnapshot().revealedCount).toBe(2);

    // Finish 2nd answer chord speech & 2.0s grid wait -> default final replay pass
    announcer.finishLatest();
    advanceAndTick(synth, clock, 1.85);
    expect(controller.getSnapshot().phase).toBe('post_answer_pause');
    // EQ stays ducked while the last answer chord fades out so it does not lift early
    expect(synth.ducked).toBe(true);

    // Post-answer pause (clears release tail + silence) -> post_answer_replay -> next_question_pause
    advanceAndTick(synth, clock, 0.75);
    expect(controller.getSnapshot().phase).toBe('post_answer_replay');
    expect(synth.ducked).toBe(false);
    expect(controller.getSnapshot().revealedCount).toBe(2);

    advanceAndTick(synth, clock, 4.2);
    expect(controller.getSnapshot().phase).toBe('next_question_pause');

    // Auto-advance to Question 2 directly (no orientation on fixed key)
    advanceAndTick(synth, clock, 1.2);
    expect(controller.getSnapshot().questionNumber).toBe(2);
    expect(controller.getSnapshot().phase).toBe('question_playing');
    expect(controller.getSnapshot().revealedCount).toBe(0);
  });

  it('locks Answer Reveal to the tempo grid when speech finishes early', () => {
    const { controller, synth, announcer, clock } = createHarness({
      allowedChords: ['I', 'IV'],
      bpm: 120, // 4 beats = 2.0s slot
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
    });

    controller.start();
    // Skip straight to answer at t = 0
    controller.skipToAnswer();
    expect(controller.getSnapshot().phase).toBe('answer_revealing');
    expect(controller.getSnapshot().revealedCount).toBe(1);

    const revealChordsBefore = synth.chords.length;
    const firstRevealStart = synth.chords[revealChordsBefore - 1].startTime;

    // Speech finishes early at 0.4s (< 2.0s grid)
    synth.currentTime += 0.4;
    announcer.finishLatest();
    clock.tick();

    // Should still be on chord 1 at t = 1.9s
    synth.currentTime = firstRevealStart + 1.9;
    clock.tick();
    expect(controller.getSnapshot().revealedCount).toBe(1);

    // Advances cleanly once t >= firstRevealStart + 2.0s
    synth.currentTime = firstRevealStart + 2.05;
    clock.tick();
    expect(controller.getSnapshot().revealedCount).toBe(2);
    expect(synth.chords[revealChordsBefore - 1].releasedAt).toBeCloseTo(
      synth.currentTime + 0.04,
      2,
    );
  });

  it('extends chord sustain until long speech completes without clipping', () => {
    const { controller, synth, announcer, clock } = createHarness({
      allowedChords: ['viihalfdim7'],
      bpm: 240, // 4 beats = 1.0s slot
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      halfDimNaming: 'minor-seven-flat-five',
    });

    controller.start();
    controller.skipToAnswer();
    expect(announcer.spoken[announcer.spoken.length - 1].text).toBe(
      'Seven minor seven flat five',
    );
    expect(controller.getSnapshot().revealedCount).toBe(1);

    // Past the 1.0s musical beat, speech is still running -> must NOT advance yet
    advanceAndTick(synth, clock, 1.5);
    expect(controller.getSnapshot().revealedCount).toBe(1);
    const heldChord = synth.chords[synth.chords.length - 1];
    expect(heldChord.releasedAt).toBeNull();

    // Speech finally ends at t = 1.6s -> waits 0.12s breathing room then advances
    announcer.finishLatest();
    clock.tick();
    expect(controller.getSnapshot().revealedCount).toBe(1);

    advanceAndTick(synth, clock, 0.15);
    expect(controller.getSnapshot().revealedCount).toBe(2);
  });

  it('omits accompaniment chords in Answer Reveal when playChordsBehindAnswer is false', () => {
    const { controller, synth } = createHarness({
      allowedChords: ['I', 'V'],
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      playChordsBehindAnswer: false,
    });

    controller.start();
    const countBeforeAnswer = synth.chords.length;
    controller.skipToAnswer();
    expect(synth.chords.length).toBe(countBeforeAnswer);
    expect(synth.ducked).toBe(false);
  });

  it('plays post-answer replay by default and skips it when playFinalReplayAfterAnswer is false', () => {
    expect(DEFAULT_SETTINGS.playFinalReplayAfterAnswer).toBe(true);

    const { controller, synth, announcer, clock } = createHarness({
      allowedChords: ['I', 'IV'],
      bpm: 240, // 4 beats = 1.0s per chord
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
    });

    controller.start();
    controller.skipToAnswer();
    announcer.finishLatest();
    advanceAndTick(synth, clock, 1.15);
    announcer.finishLatest();
    advanceAndTick(synth, clock, 1.15);

    expect(controller.getSnapshot().phase).toBe('post_answer_pause');
    expect(synth.ducked).toBe(true);
    advanceAndTick(synth, clock, 0.75);
    expect(controller.getSnapshot().phase).toBe('post_answer_replay');
    expect(synth.ducked).toBe(false);
    expect(controller.getSnapshot().revealedCount).toBe(2);

    // Explicitly disabling final replay skips straight to next_question_pause
    const noReplay = createHarness({
      allowedChords: ['I', 'IV'],
      bpm: 240,
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      playFinalReplayAfterAnswer: false,
    });
    noReplay.controller.start();
    noReplay.controller.skipToAnswer();
    noReplay.announcer.finishLatest();
    advanceAndTick(noReplay.synth, noReplay.clock, 1.15);
    noReplay.announcer.finishLatest();
    advanceAndTick(noReplay.synth, noReplay.clock, 1.15);
    expect(noReplay.controller.getSnapshot().phase).toBe('next_question_pause');
  });

  it('auto-rotates key every K questions, updates scale-tone drone, and applies mix volumes', () => {
    const { controller, synth, drone, announcer, clock } = createHarness(
      {
        rotateEveryNQuestions: 2,
        keyOrientation: 'cadence',
        droneEnabled: true,
        droneScaleDegree: 5, // 5th (+7 semitones) of active key
        droneOctave: 2,
        chordVolume: 0.6,
        voiceVolume: 0.95,
      },
      [0.0, 0.2, 0.4, 0.6, 0.8],
    );

    expect(DEFAULT_SETTINGS.keyMode).toBe('auto-rotate');

    controller.start();
    const initialKey = controller.getSnapshot().activeKey;
    expect(synth.chordVolume).toBe(0.6);
    expect(synth.voiceVolume).toBe(0.95);
    expect(drone.active).toBe(true);
    expect(drone.pitch).toBe((initialKey + 7) % 12);
    expect(drone.octave).toBe(2);

    // Live mix volume and drone octave updates propagate immediately
    controller.updateSettings({
      ...DEFAULT_SETTINGS,
      rotateEveryNQuestions: 2,
      keyOrientation: 'cadence',
      droneEnabled: true,
      droneScaleDegree: 5,
      droneOctave: -1,
      chordVolume: 0.4,
      voiceVolume: 1.0,
    });
    expect(synth.chordVolume).toBe(0.4);
    expect(synth.voiceVolume).toBe(1.0);
    expect(drone.octave).toBe(-1);

    // Complete Q1 via skip-through-answer -> next
    controller.skipToAnswer();
    controller.skipToAnswer();
    expect(controller.getSnapshot().questionNumber).toBe(2);
    expect(controller.getSnapshot().activeKey).toBe(initialKey);

    // Complete Q2 -> rotates on Q3 and shifts drone to 5th of new key!
    controller.skipToAnswer();
    controller.skipToAnswer();
    const q3Snap = controller.getSnapshot();
    expect(q3Snap.questionNumber).toBe(3);
    expect(q3Snap.activeKey).not.toBe(initialKey);
    expect(q3Snap.phase).toBe('orienting_voice');
    expect(drone.pitch).toBe((q3Snap.activeKey + 7) % 12);

    // Finish orientation speech cleanly
    announcer.finishLatest();
    advanceAndTick(synth, clock, 0.2);
    expect(controller.getSnapshot().phase).toBe('orienting_cadence');
  });

  it('ignores stale speech callbacks after Replay, Skip, and Stop via epoch guard', () => {
    const { controller, announcer } = createHarness({
      allowedChords: ['I', 'IV', 'V'],
      progressionLength: 3,
      questionRepeats: 2,
      keyOrientation: 'none',
    });

    controller.start();
    controller.skipToAnswer();
    const staleSpoken = announcer.spoken[announcer.spoken.length - 1];
    expect(controller.getSnapshot().phase).toBe('answer_revealing');
    expect(controller.getSnapshot().revealedCount).toBe(1);

    // Replay resets to Pass 1 with revealedCount 0
    controller.replayQuestion();
    expect(controller.getSnapshot().phase).toBe('question_playing');
    expect(controller.getSnapshot().currentPass).toBe(1);
    expect(controller.getSnapshot().revealedCount).toBe(0);

    // Stale speech callback firing late must NOT mutate state
    staleSpoken.options.onEnd?.();
    expect(controller.getSnapshot().phase).toBe('question_playing');

    // Stop shuts down everything cleanly
    controller.stop();
    expect(controller.getSnapshot().phase).toBe('idle');
    expect(controller.getSnapshot().isRunning).toBe(false);
    expect(vi.isMockFunction(announcer.cancel)).toBe(false);
    expect(announcer.cancelCalls).toBeGreaterThanOrEqual(2);
  });

  it('auditions a warm preview chord while idle, replaces prior preview, and skips while running', () => {
    const { controller, synth } = createHarness({
      timbre: 'felt-piano',
      ambience: 'warm-room',
    });

    controller.previewSound('warm-rhodes', 'lush-hall');
    expect(synth.chords).toHaveLength(1);
    expect(synth.chords[0].timbre).toBe('warm-rhodes');
    expect(synth.ambience).toBe('lush-hall');

    // Second preview cleanly releases first preview chord
    controller.previewSound('soft-vibes', 'dry');
    expect(synth.chords).toHaveLength(2);
    expect(synth.chords[0].releasedAt).not.toBeNull();
    expect(synth.chords[1].timbre).toBe('soft-vibes');
    expect(synth.ambience).toBe('dry');

    // While running, previewSound is a no-op
    controller.start();
    const countWhileRunning = synth.chords.length;
    controller.previewSound('velvet-pad', 'warm-room');
    expect(synth.chords).toHaveLength(countWhileRunning);
  });

  it('speaks triad numbers only by default and includes major/minor/diminished when announceTriadQuality is enabled', () => {
    // Default (announceTriadQuality = false): minor & diminished triads omit quality
    const defaultRun = createHarness({
      allowedChords: ['ii'],
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
    });
    defaultRun.controller.start();
    defaultRun.controller.skipToAnswer();
    expect(defaultRun.announcer.spoken[0].text).toBe('Two');

    // Enabled (announceTriadQuality = true): I speaks "One major", vii° speaks "Seven diminished"
    const majorRun = createHarness({
      allowedChords: ['I'],
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      announceTriadQuality: true,
    });
    majorRun.controller.start();
    majorRun.controller.skipToAnswer();
    expect(majorRun.announcer.spoken[0].text).toBe('One major');

    const dimRun = createHarness({
      allowedChords: ['viio'],
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      announceTriadQuality: true,
    });
    dimRun.controller.start();
    dimRun.controller.skipToAnswer();
    expect(dimRun.announcer.spoken[0].text).toBe('Seven diminished');

    // Seventh chords stay unchanged
    const seventhRun = createHarness({
      allowedChords: ['ii7'],
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      announceTriadQuality: false,
    });
    seventhRun.controller.start();
    seventhRun.controller.skipToAnswer();
    expect(seventhRun.announcer.spoken[0].text).toBe('Two minor seven');
  });

  it('supports SATB choir (default), Left-to-Right, Random voice-led stereo, and Stereo OFF centered mono', () => {
    // Default: Stereo ON + SATB choir ([0.24, -0.24, 0.72, -0.72] for [B, T, A, S])
    expect(DEFAULT_SETTINGS.voicePanning).toBe(true);
    expect(DEFAULT_SETTINGS.voicePanningMode).toBe('satb');

    const defaultSatbRun = createHarness({
      allowedChords: ['I', 'IV'],
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
    });
    defaultSatbRun.controller.start();
    expect(defaultSatbRun.synth.chords[0].notes.map((n) => n.pan)).toEqual([
      0.24, -0.24, 0.72, -0.72,
    ]);

    // Left-to-right panning
    const ltrRun = createHarness({
      allowedChords: ['I', 'IV'],
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      timbre: 'velvet-pad',
      voicePanning: true,
      voicePanningMode: 'left-to-right',
    });
    ltrRun.controller.start();
    expect(ltrRun.synth.chords[0].notes.map((n) => n.pan)).toEqual([
      -0.84, -0.28, 0.28, 0.84,
    ]);

    // Stereo OFF: true centered mono (pan = 0 on every voice)
    const monoRun = createHarness({
      allowedChords: ['I', 'IV'],
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      voicePanning: false,
    });
    monoRun.controller.start();
    expect(monoRun.synth.chords[0].notes.every((n) => n.pan === 0)).toBe(true);

    // Stereo ON + Random: shuffled wide seats that follow voice leading across chords
    const randRun = createHarness(
      {
        allowedChords: ['I', 'IV', 'V', 'vi'],
        bpm: 240, // 1.0s per chord
        progressionLength: 2,
        questionRepeats: 1,
        keyOrientation: 'none',
        voicePanning: true,
        voicePanningMode: 'random',
      },
      [0.15, 0.7, 0.35, 0.85, 0.25, 0.6],
    );
    randRun.controller.start();
    advanceAndTick(randRun.synth, randRun.clock, 1.2);
    expect(randRun.synth.chords.length).toBeGreaterThanOrEqual(2);

    const chord0Pans = randRun.synth.chords[0].notes.map((n) => n.pan!);
    const chord1Pans = randRun.synth.chords[1].notes.map((n) => n.pan!);
    expect([...chord0Pans].sort((a, b) => a - b)).toEqual([
      -0.84, -0.28, 0.28, 0.84,
    ]);
    // Bass stays in same pan seat and upper pan set stays identical
    expect(chord1Pans[0]).toBe(chord0Pans[0]);
    expect([...chord1Pans.slice(1)].sort((a, b) => a - b)).toEqual(
      [...chord0Pans.slice(1)].sort((a, b) => a - b),
    );
  });

  it('randomly assigns ooh and ahh vowels per chord for SATB Choir', () => {
    const run = createHarness(
      {
        allowedChords: ['I', 'IV', 'V', 'vi'],
        bpm: 240, // 1.0s per chord
        progressionLength: 4,
        questionRepeats: 1,
        keyOrientation: 'none',
        timbre: 'satb-choir',
      },
      // Alternating <0.5 and >=0.5 so progression vowels mix ooh and ahh
      [0.1, 0.8, 0.2, 0.9, 0.15, 0.85, 0.25, 0.75, 0.1, 0.9, 0.2, 0.8],
    );

    run.controller.start();
    advanceAndTick(run.synth, run.clock, 3.6);
    expect(run.synth.chords.length).toBeGreaterThanOrEqual(4);

    const chordVowels = run.synth.chords.slice(0, 4).map((c) => {
      const v = c.notes[0].vowel;
      // All 4 voices within a single chord sing the same vowel
      expect(c.notes.every((n) => n.vowel === v)).toBe(true);
      expect(v === 'ooh' || v === 'ahh').toBe(true);
      return v;
    });
    // Mix of both vowels across the progression
    expect(new Set(chordVowels).size).toBe(2);
  });

  it('keeps the voice-pocket EQ engaged through the last answer chord release and lifts in silence before the next chord', () => {
    const withReplay = createHarness({
      allowedChords: ['I', 'IV'],
      bpm: 240, // 4 beats = 1.0s per chord
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      timbre: 'velvet-pad', // 0.55s default release tail
      playChordsBehindAnswer: true,
      playFinalReplayAfterAnswer: true,
    });

    withReplay.controller.start();
    withReplay.controller.skipToAnswer();
    withReplay.announcer.finishLatest();
    advanceAndTick(withReplay.synth, withReplay.clock, 1.1);
    withReplay.announcer.finishLatest();
    advanceAndTick(withReplay.synth, withReplay.clock, 1.1);

    expect(withReplay.controller.getSnapshot().phase).toBe('post_answer_pause');
    const lastRevealChord =
      withReplay.synth.chords[withReplay.synth.chords.length - 1];
    expect(lastRevealChord.releasedAt).not.toBeNull();

    // Still fading out 0.35s into the 0.55s release -> must remain ducked
    advanceAndTick(withReplay.synth, withReplay.clock, 0.35);
    expect(withReplay.controller.getSnapshot().phase).toBe('post_answer_pause');
    expect(withReplay.synth.ducked).toBe(true);

    // After the 0.55s release tail + silence margin, transitions into replay
    advanceAndTick(withReplay.synth, withReplay.clock, 0.45);
    expect(withReplay.controller.getSnapshot().phase).toBe('post_answer_replay');
    expect(withReplay.synth.ducked).toBe(false);

    const liftEvent = [...withReplay.synth.duckEvents]
      .reverse()
      .find((e) => e.ducked === false);
    const firstReplayChord =
      withReplay.synth.chords[withReplay.synth.chords.length - 1];

    expect(liftEvent).toBeDefined();
    // Lifted strictly AFTER the 0.55s release tail finished
    expect(liftEvent!.currentTime).toBeGreaterThanOrEqual(
      lastRevealChord.releasedAt! + 0.55,
    );
    // And BEFORE the first replay chord starts, with a fast silent time constant
    expect(liftEvent!.currentTime).toBeLessThan(firstReplayChord.startTime);
    expect(liftEvent!.timeConstantSec).toBeLessThanOrEqual(0.01);
    expect(firstReplayChord.duckedWhenStarted).toBe(false);

    // Also verify when final replay is disabled: stays ducked through release, lifts before Q2
    const noReplay = createHarness({
      allowedChords: ['I', 'IV'],
      bpm: 240,
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      timbre: 'warm-strings', // 0.56s default release tail
      playChordsBehindAnswer: true,
      playFinalReplayAfterAnswer: false,
    });
    noReplay.controller.start();
    noReplay.controller.skipToAnswer();
    noReplay.announcer.finishLatest();
    advanceAndTick(noReplay.synth, noReplay.clock, 1.1);
    noReplay.announcer.finishLatest();
    advanceAndTick(noReplay.synth, noReplay.clock, 1.1);

    expect(noReplay.controller.getSnapshot().phase).toBe('next_question_pause');
    expect(noReplay.synth.ducked).toBe(true);

    // Advances to Question 2 after 1.1s pause -> lifts in silence before Q2 chord 1
    advanceAndTick(noReplay.synth, noReplay.clock, 1.2);
    expect(noReplay.controller.getSnapshot().phase).toBe('question_playing');
    expect(noReplay.synth.ducked).toBe(false);
    const q2FirstChord = noReplay.synth.chords[noReplay.synth.chords.length - 1];
    expect(q2FirstChord.duckedWhenStarted).toBe(false);
  });

  it('excludes secondary dominants when disabled and announces strictly resolved secondary dominants when enabled', () => {
    // Disabled by default: even with allowedSecondaryDominants populated, never emitted
    const disabled = createHarness(
      {
        allowedChords: ['I', 'V'],
        secondaryDominantsEnabled: false,
        allowedSecondaryDominants: ['V7/V'],
        progressionLength: 2,
        questionRepeats: 1,
        keyOrientation: 'none',
      },
      [0.01, 0.01, 0.01, 0.01],
    );
    disabled.controller.start();
    expect(disabled.controller.getSnapshot().progression).not.toContain('V7/V');

    // Enabled (strict resolution ON by default): rng=0.01 triggers V7/V -> V and speaks "Five seven of five"
    const enabled = createHarness(
      {
        allowedChords: ['I', 'V'],
        secondaryDominantsEnabled: true,
        allowedSecondaryDominants: ['V7/V'],
        progressionLength: 2,
        questionRepeats: 1,
        keyOrientation: 'none',
      },
      [0.01, 0.01, 0.01, 0.01],
    );
    enabled.controller.start();
    expect(enabled.controller.getSnapshot().progression).toEqual(['V7/V', 'V']);
    enabled.controller.skipToAnswer();
    expect(enabled.announcer.spoken[0].text).toBe('Five seven of five');

    // Enabled with strictSecondaryResolution=false: does NOT force resolution to V
    const freeMove = createHarness(
      {
        allowedChords: ['I'],
        secondaryDominantsEnabled: true,
        allowedSecondaryDominants: ['V7/V'],
        strictSecondaryResolution: false,
        progressionLength: 2,
        questionRepeats: 1,
        keyOrientation: 'none',
      },
      [0.01, 0.01, 0.01, 0.01],
    );
    freeMove.controller.start();
    expect(freeMove.controller.getSnapshot().progression).toEqual(['V7/V', 'I']);
  });

  it('tracks progressionInversions, voices inverted bass tones, speaks inversion phrases, and updates lock-screen metadata', () => {
    const { controller, synth, announcer, pocket, clock } = createHarness({
      allowedChords: ['V7', 'I'],
      bpm: 240,
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      keyMode: 'fixed',
      fixedKey: 0, // C major
      chordInversionOverrides: {
        V7: [3], // V7 3rd inversion -> F in bass (F % 12 === 5)
        I: [1], // I 1st inversion -> E in bass (E % 12 === 4)
      },
      inversionNotation: 'inversion-name',
    });

    controller.start();
    advanceAndTick(synth, clock, 1.05);
    const snap = controller.getSnapshot();
    expect(snap.progressionInversions).toHaveLength(2);
    snap.progression.forEach((chordId, i) => {
      const expectedBassPc = chordId === 'V7' ? 5 : 4;
      expect(snap.progressionInversions[i]).toBe(chordId === 'V7' ? 3 : 1);
      expect(synth.chords[i].notes[0].midi % 12).toBe(expectedBassPc);
    });

    controller.skipToAnswer();
    expect(announcer.spoken[0].text).toMatch(
      /^(Five seven third inversion|One first inversion)$/,
    );
    const firstExpectedLabel =
      snap.progression[0] === 'V7' ? 'V7' : 'I';
    expect(pocket.metadataTitles[pocket.metadataTitles.length - 1]).toBe(
      firstExpectedLabel,
    );

    // Finish first chord reveal and verify second chord speaks in Bass tone mode
    controller.updateSettings({
      ...DEFAULT_SETTINGS,
      allowedChords: ['V7', 'I'],
      bpm: 240,
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      keyMode: 'fixed',
      fixedKey: 0,
      chordInversionOverrides: { V7: [3], I: [1] },
      inversionNotation: 'bass-tone',
    });
    announcer.finishLatest();
    advanceAndTick(synth, clock, 1.1);
    expect(announcer.spoken[1].text).toMatch(
      /^(Five seven seventh in bass|One third in bass)$/,
    );
  });

  it('announces inverted chords in scale-degree and solfege modes and updates concise lock-screen metadata', () => {
    const { controller, synth, announcer, pocket, clock } = createHarness(
      {
        allowedChords: ['V', 'V7'],
        bpm: 240,
        progressionLength: 2,
        questionRepeats: 1,
        keyOrientation: 'none',
        keyMode: 'fixed',
        fixedKey: 0,
        chordInversionOverrides: {
          V: [1], // V (over 7 / Ti)
          V7: [3], // V7 (over 4 / Fa)
        },
        inversionNotation: 'scale-degree',
      },
      [0.05, 0.95, 0.5, 0.5],
    );

    controller.start();
    advanceAndTick(synth, clock, 1.05);
    const snap = controller.getSnapshot();
    const firstIsV = snap.progression[0] === 'V';

    controller.skipToAnswer();
    expect(announcer.spoken[0].text).toBe(
      firstIsV ? 'Five over degree seven' : 'Five seven over degree four',
    );
    expect(pocket.metadataTitles[pocket.metadataTitles.length - 1]).toBe(
      firstIsV ? 'V' : 'V7',
    );

    controller.updateSettings({
      ...DEFAULT_SETTINGS,
      allowedChords: ['V', 'V7'],
      bpm: 240,
      progressionLength: 2,
      questionRepeats: 1,
      keyOrientation: 'none',
      keyMode: 'fixed',
      fixedKey: 0,
      chordInversionOverrides: { V: [1], V7: [3] },
      inversionNotation: 'solfege',
    });
    announcer.finishLatest();
    advanceAndTick(synth, clock, 1.1);
    expect(announcer.spoken[1].text).toBe(
      firstIsV ? 'Five seven over fa' : 'Five over ti',
    );
    expect(pocket.metadataTitles[pocket.metadataTitles.length - 1]).toBe(
      firstIsV ? 'V-V7' : 'V7-V',
    );
  });

  it('plays an identical counterpoint melody on Question passes and Final Replay while muting Orientation and Answer Reveal', () => {
    const { controller, synth, announcer, clock } = createHarness(
      {
        allowedChords: ['I', 'IV', 'V', 'vi'],
        bpm: 120, // 2.0s per chord
        progressionLength: 3,
        questionRepeats: 2,
        repeatPauseSec: 0.6,
        keyMode: 'fixed',
        fixedKey: 0,
        keyOrientation: 'tonic',
        voicePanning: true,
        voicePanningMode: 'satb',
        playFinalReplayAfterAnswer: true,
        melodyEnabled: true,
        melodyAllowTensions: false,
        melodyVolume: 0.6,
        melodyTimbre: 'soft-vibes',
      },
      [0.2, 0.7, 0.35, 0.85, 0.15, 0.6, 0.4, 0.9],
    );

    controller.start();
    expect(synth.melodyVolume).toBe(0.6);

    // Finish orientation speech and cadence -> must have ZERO melody notes
    announcer.finishLatest();
    advanceAndTick(synth, clock, 1.5);
    const orientationNotes = synth.chords[0].notes;
    expect(orientationNotes.some((n) => n.role === 'melody')).toBe(false);

    // Finish inter-phase pause -> Pass 1 plays all 3 chords
    advanceAndTick(synth, clock, 1.0);
    const pass1StartIdx = 1;
    advanceAndTick(synth, clock, 6.1);
    const pass1MelodyPitches = synth.chords
      .slice(pass1StartIdx, pass1StartIdx + 3)
      .map((ch) => {
        const mNotes = ch.notes.filter((n) => n.role === 'melody');
        expect(mNotes.length).toBeGreaterThanOrEqual(1);
        for (const mn of mNotes) {
          expect(mn.timbre).toBe('soft-vibes');
          expect(mn.pan).toBe(0);
        }
        return mNotes.map((mn) => mn.midi);
      });

    // Finish repeat pause -> Pass 2 replays the exact same melody
    advanceAndTick(synth, clock, 6.9);
    const pass2MelodyPitches = synth.chords
      .slice(pass1StartIdx + 3, pass1StartIdx + 6)
      .map((ch) => ch.notes.filter((n) => n.role === 'melody').map((mn) => mn.midi));
    expect(pass2MelodyPitches).toEqual(pass1MelodyPitches);

    // Finish pre_answer_pause -> Answer Reveal chords have ZERO melody notes
    advanceAndTick(synth, clock, 1.2);
    expect(controller.getSnapshot().phase).toBe('answer_revealing');
    const answerRevealStart = pass1StartIdx + 6;
    expect(
      synth.chords[answerRevealStart].notes.some((n) => n.role === 'melody'),
    ).toBe(false);

    // Advance all 3 answer reveals -> Final Replay includes the exact same melody again
    for (let i = 0; i < 3; i++) {
      announcer.finishLatest();
      advanceAndTick(synth, clock, 2.05);
    }
    advanceAndTick(synth, clock, 6.2);
    const replayChords = synth.chords.slice(
      answerRevealStart + 3,
      answerRevealStart + 6,
    );
    const replayMelodyPitches = replayChords.map((ch) =>
      ch.notes.filter((n) => n.role === 'melody').map((mn) => mn.midi),
    );
    expect(replayMelodyPitches).toEqual(pass1MelodyPitches);
  });

  it('propagates audio output profile on start and live updateSettings', () => {
    const { controller, synth } = createHarness({
      outputProfile: 'auto',
    });

    controller.start();
    expect(synth.outputProfile).toBe('auto');

    controller.updateSettings({
      ...DEFAULT_SETTINGS,
      outputProfile: 'headphones',
    });
    expect(synth.outputProfile).toBe('headphones');

    controller.updateSettings({
      ...DEFAULT_SETTINGS,
      outputProfile: 'phone-speaker',
    });
    expect(synth.outputProfile).toBe('phone-speaker');
  });

  it('publishes concise lock-screen metadata without Answer/Complete prefixes or inversion clutter', () => {
    const { controller, synth, announcer, pocket, clock } = createHarness(
      {
        allowedChords: ['I', 'IV', 'V', 'vi'],
        bpm: 120,
        progressionLength: 3,
        questionRepeats: 2,
        repeatPauseSec: 0.4,
        keyOrientation: 'none',
        keyMode: 'fixed',
        fixedKey: 0,
        triadInversions: [0, 1, 2],
        playFinalReplayAfterAnswer: false,
      },
      [0.15, 0.45, 0.75, 0.35, 0.65, 0.25],
    );

    controller.start();
    expect(pocket.metadataTitles).toContain('Q1 · Pass 1/2');
    const prog = controller.getSnapshot().progression;

    // Play pass 1 + repeat pause + pass 2
    advanceAndTick(synth, clock, 6.6);
    expect(pocket.metadataTitles).toContain('Q1 · Pass 2/2');

    // Finish pass 2 + pre_answer_pause -> reveal chord 1, 2, 3
    advanceAndTick(synth, clock, 6.8);
    expect(controller.getSnapshot().phase).toBe('answer_revealing');
    expect(pocket.metadataTitles[pocket.metadataTitles.length - 1]).toBe(
      prog[0],
    );

    announcer.finishLatest();
    advanceAndTick(synth, clock, 2.05);
    expect(pocket.metadataTitles[pocket.metadataTitles.length - 1]).toBe(
      `${prog[0]}-${prog[1]}`,
    );

    announcer.finishLatest();
    advanceAndTick(synth, clock, 2.05);
    const fullAnswerTitle = `${prog[0]}-${prog[1]}-${prog[2]}`;
    expect(pocket.metadataTitles[pocket.metadataTitles.length - 1]).toBe(
      fullAnswerTitle,
    );

    // Finish final answer chord -> enters next_question_pause with no "Complete" flicker
    announcer.finishLatest();
    advanceAndTick(synth, clock, 2.05);
    expect(controller.getSnapshot().phase).toBe('next_question_pause');
    expect(pocket.metadataTitles.some((t) => /complete/i.test(t))).toBe(false);
    expect(pocket.metadataTitles.some((t) => /answer:/i.test(t))).toBe(false);
    expect(pocket.metadataTitles[pocket.metadataTitles.length - 1]).toBe(
      fullAnswerTitle,
    );
  });
});
