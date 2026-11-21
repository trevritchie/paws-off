import { useCallback, useEffect, useRef, useState } from 'react';
import { PolySynth } from '../audio/synth';
import { HybridVoiceAnnouncer } from '../engine/hybridAnnouncer';
import {
  SessionController,
  type SessionSnapshot,
} from '../engine/sessionController';
import type { SpeechVoiceOption } from '../engine/speech';
import {
  loadSettings,
  saveSettings,
  type AmbienceMode,
  type AudioOutputProfile,
  type SessionSettings,
  type TimbreId,
  type VoicePanningMode,
} from '../types/settings';

function createInitialSnapshot(settings: SessionSettings): SessionSnapshot {
  return {
    phase: 'idle',
    isRunning: false,
    activeKey: settings.fixedKey,
    questionNumber: 0,
    currentPass: 1,
    totalPasses: settings.questionRepeats,
    progression: [],
    progressionInversions: [],
    activeChordIndex: -1,
    revealedCount: 0,
    orientationStepIndex: -1,
    orientationChords: [],
    wakeLockActive: false,
    speechAvailable:
      settings.voiceSource === 'recorded' ||
      (typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        typeof SpeechSynthesisUtterance !== 'undefined'),
  };
}

export function useEarTrainer() {
  const [settings, setSettings] = useState<SessionSettings>(() => loadSettings());
  const settingsRef = useRef<SessionSettings>(settings);
  settingsRef.current = settings;

  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() =>
    createInitialSnapshot(settings),
  );
  const [voices, setVoices] = useState<SpeechVoiceOption[]>([]);

  const controllerRef = useRef<SessionController | null>(null);

  useEffect(() => {
    const synth = new PolySynth();
    const announcer = new HybridVoiceAnnouncer(
      synth,
      settingsRef.current.voiceSource,
    );
    setVoices(announcer.getVoices());
    const unsubVoices = announcer.onVoicesChanged(() => {
      setVoices(announcer.getVoices());
    });

    const controller = new SessionController(settingsRef.current, {
      synth,
      announcer,
    });
    controllerRef.current = controller;
    const unsubController = controller.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    return () => {
      unsubVoices();
      unsubController();
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Sync visual chord glow on animation frames while running.
  useEffect(() => {
    if (!snapshot.isRunning) return;

    let frameId = 0;
    const step = () => {
      controllerRef.current?.syncVisualCues();
      frameId = window.requestAnimationFrame(step);
    };
    frameId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [snapshot.isRunning]);

  const updateSettings = useCallback(
    (updater: Partial<SessionSettings> | ((prev: SessionSettings) => SessionSettings)) => {
      setSettings((prev) => {
        const next =
          typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        saveSettings(next);
        controllerRef.current?.updateSettings(next);
        return next;
      });
    },
    [],
  );

  const start = useCallback(() => {
    controllerRef.current?.start();
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.stop();
  }, []);

  const replayQuestion = useCallback(() => {
    controllerRef.current?.replayQuestion();
  }, []);

  const skipToAnswer = useCallback(() => {
    controllerRef.current?.skipToAnswer();
  }, []);

  const previewSound = useCallback(
    (
      timbre?: TimbreId,
      ambience?: AmbienceMode,
      voicePanning?: boolean,
      voicePanningMode?: VoicePanningMode,
      outputProfile?: AudioOutputProfile,
    ) => {
      controllerRef.current?.previewSound(
        timbre,
        ambience,
        voicePanning,
        voicePanningMode,
        outputProfile,
      );
    },
    [],
  );

  const previewMelodySound = useCallback((timbre?: TimbreId) => {
    controllerRef.current?.previewMelodySound(timbre);
  }, []);

  return {
    settings,
    updateSettings,
    snapshot,
    voices,
    start,
    stop,
    replayQuestion,
    skipToAnswer,
    previewSound,
    previewMelodySound,
  };
}
