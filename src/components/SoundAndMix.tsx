import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { formatDroneNoteName } from '../audio/drone';
import { getInstrumentPreset, INSTRUMENT_PRESETS } from '../audio/instruments';
import {
  TIMBRE_CATEGORY_OPTIONS,
  type TimbreCategoryFilter,
} from '../audio/instruments/types';
import { AMBIENCE_OPTIONS } from '../audio/reverb';
import { getScaleDegreePitchClass } from '../music/chords';
import {
  type AmbienceMode,
  type DroneOctave,
  type PitchClass,
  type ScaleDegree,
  type SessionSettings,
  type TimbreId,
  type VoicePanningMode,
} from '../types/settings';
import { SwitchRow } from './SwitchRow';

const SCALE_DEGREES: readonly ScaleDegree[] = [1, 2, 3, 4, 5, 6, 7];

const DRONE_OCTAVE_OPTIONS: readonly { value: DroneOctave; label: string }[] = [
  { value: -1, label: 'Low (-1)' },
  { value: 0, label: '0' },
  { value: 1, label: '+1' },
  { value: 2, label: 'High (+2)' },
];

interface SoundAndMixProps {
  settings: SessionSettings;
  activeKey: PitchClass;
  isRunning: boolean;
  onUpdate: (patch: Partial<SessionSettings>) => void;
  onPreviewSound: (
    timbre?: TimbreId,
    ambience?: AmbienceMode,
    voicePanning?: boolean,
    voicePanningMode?: VoicePanningMode,
  ) => void;
  onPreviewMelodySound: (timbre?: TimbreId) => void;
}

export function SoundAndMix({
  settings,
  activeKey,
  isRunning,
  onUpdate,
  onPreviewSound,
  onPreviewMelodySound,
}: SoundAndMixProps) {
  const [chordSoundOpen, setChordSoundOpen] = useState(false);
  const [melodySoundOpen, setMelodySoundOpen] = useState(false);
  const [chordCategory, setChordCategory] = useState<TimbreCategoryFilter>(
    () => getInstrumentPreset(settings.timbre).category,
  );
  const [melodyCategory, setMelodyCategory] = useState<TimbreCategoryFilter>(
    () => getInstrumentPreset(settings.melodyTimbre).category,
  );

  const handleToggleChordSound = () => {
    setChordSoundOpen((prev) => {
      const next = !prev;
      if (next) {
        setChordCategory(getInstrumentPreset(settings.timbre).category);
      }
      return next;
    });
  };

  const handleToggleMelodySound = () => {
    setMelodySoundOpen((prev) => {
      const next = !prev;
      if (next) {
        setMelodyCategory(getInstrumentPreset(settings.melodyTimbre).category);
      }
      return next;
    });
  };

  const filteredChordPresets = INSTRUMENT_PRESETS.filter(
    (option) => chordCategory === 'all' || option.category === chordCategory,
  );
  const filteredMelodyPresets = INSTRUMENT_PRESETS.filter(
    (option) => melodyCategory === 'all' || option.category === melodyCategory,
  );

  const droneResolvedPitch = formatDroneNoteName(
    getScaleDegreePitchClass(activeKey, settings.droneScaleDegree),
    settings.droneOctave,
  );
  const showResolvedDroneNote = isRunning || settings.keyMode === 'fixed';

  return (
    <section
      aria-label="Sound and mix"
      className="mt-3 space-y-4 rounded-2xl border border-[#2B323B] bg-[#1B1F24] p-4"
    >
      {/* Sound preset grids */}
      <div>
        <button
          type="button"
          aria-expanded={chordSoundOpen}
          aria-controls="chord-sound-grid"
          onClick={handleToggleChordSound}
          className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg text-left text-sm font-semibold text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
        >
          <span>Chord sound</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-[#9CA3AE]">
            <span>{getInstrumentPreset(settings.timbre).label}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                chordSoundOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </span>
        </button>

        {chordSoundOpen && (
          <div className="mt-2">
            {!isRunning && (
              <p className="mb-1.5 text-xs text-[#9CA3AE]">
                Tap any preset to preview
              </p>
            )}
            <div
              className="mb-2 grid grid-cols-5 gap-1"
              role="group"
              aria-label="Chord sound category"
            >
              {TIMBRE_CATEGORY_OPTIONS.map((cat) => {
                const active = chordCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setChordCategory(cat.id)}
                    className={`min-h-[30px] rounded-lg border px-1 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C] ${
                      active
                        ? 'border-[#E5A93C] bg-[#E5A93C]/20 text-[#E5A93C]'
                        : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
            <div
              id="chord-sound-grid"
              className="grid grid-cols-2 gap-1.5"
              role="group"
              aria-label="Synth sound"
            >
              {filteredChordPresets.map((option) => {
                const active = settings.timbre === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      onUpdate({
                        timbre: option.id,
                        melodyTimbre: option.id,
                      });
                      setMelodyCategory(option.category);
                      onPreviewSound(
                        option.id,
                        settings.ambience,
                        settings.voicePanning,
                        settings.voicePanningMode,
                      );
                    }}
                    className={`flex min-h-[52px] flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C] ${
                      active
                        ? 'border-[#E5A93C] bg-[#E5A93C]/20 text-[#E5A93C]'
                        : 'border-[#343C47] bg-[#252B33] text-[#F3EFE6] hover:border-[#495463]'
                    }`}
                  >
                    <span className="text-xs font-semibold leading-tight">
                      {option.label}
                    </span>
                    <span
                      className={`mt-0.5 text-[11px] leading-tight ${
                        active ? 'text-[#E5A93C]/85' : 'text-[#9CA3AE]'
                      }`}
                    >
                      {option.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Collapsible Melody sound selector grouped right below Chord sound */}
        <div className="mt-3 border-t border-[#2B323B] pt-2.5">
          <button
            type="button"
            aria-expanded={melodySoundOpen}
            aria-controls="melody-sound-grid"
            onClick={handleToggleMelodySound}
            className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg text-left text-sm font-semibold text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4]"
          >
            <span>Melody sound</span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-[#9CA3AE]">
              <span>{getInstrumentPreset(settings.melodyTimbre).label}</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  melodySoundOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </span>
          </button>

          {melodySoundOpen && (
            <div className="mt-2">
              {!settings.melodyEnabled ? (
                <p className="mb-1.5 text-xs text-[#9CA3AE]">
                  Turn on &ldquo;Melody over chords&rdquo; above to hear during
                  sessions
                </p>
              ) : (
                !isRunning && (
                  <p className="mb-1.5 text-xs text-[#9CA3AE]">
                    Matches chord sound by default · tap any preset to override
                  </p>
                )
              )}
              <div
                className="mb-2 grid grid-cols-5 gap-1"
                role="group"
                aria-label="Melody sound category"
              >
                {TIMBRE_CATEGORY_OPTIONS.map((cat) => {
                  const active = melodyCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setMelodyCategory(cat.id)}
                      className={`min-h-[30px] rounded-lg border px-1 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
                        active
                          ? 'border-[#4FB3A4] bg-[#4FB3A4]/20 text-[#4FB3A4]'
                          : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              <div
                id="melody-sound-grid"
                className="grid grid-cols-2 gap-1.5"
                role="group"
                aria-label="Melody sound"
              >
                {filteredMelodyPresets.map((option) => {
                  const active = settings.melodyTimbre === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        onUpdate({ melodyTimbre: option.id });
                        onPreviewMelodySound(option.id);
                      }}
                      className={`flex min-h-[48px] flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
                        active
                          ? 'border-[#4FB3A4] bg-[#4FB3A4]/20 text-[#4FB3A4]'
                          : 'border-[#343C47] bg-[#252B33] text-[#F3EFE6] hover:border-[#495463]'
                      }`}
                    >
                      <span className="text-xs font-semibold leading-tight">
                        {option.label}
                      </span>
                      <span
                        className={`mt-0.5 text-[11px] leading-tight ${
                          active ? 'text-[#4FB3A4]/85' : 'text-[#9CA3AE]'
                        }`}
                      >
                        {option.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Space / Ambience */}
      <div>
        <span className="block text-sm font-semibold text-[#F3EFE6]">Space</span>
        <div
          className="mt-2 grid grid-cols-3 gap-1.5"
          role="group"
          aria-label="Room ambience"
        >
          {AMBIENCE_OPTIONS.map((option) => {
            const active = settings.ambience === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onUpdate({ ambience: option.id });
                  onPreviewSound(settings.timbre, option.id);
                }}
                className={`min-h-[40px] rounded-xl border px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
                  active
                    ? 'border-[#4FB3A4] bg-[#4FB3A4]/20 text-[#4FB3A4]'
                    : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stereo voice placement */}
      <div>
        <SwitchRow
          id="toggle-stereo"
          label="Stereo"
          description={
            settings.voicePanning
              ? settings.voicePanningMode === 'satb'
                ? 'Choir sections: Soprano left, Tenor/Bass center, Alto right'
                : settings.voicePanningMode === 'left-to-right'
                  ? 'Spreads voices low to high from left to right'
                  : 'Random stereo seats that follow voice leading'
              : 'Centered mono mix'
          }
          checked={settings.voicePanning}
          onChange={(checked) => {
            onUpdate({ voicePanning: checked });
            onPreviewSound(
              settings.timbre,
              settings.ambience,
              checked,
              settings.voicePanningMode,
            );
          }}
        />

        {settings.voicePanning && (
          <div
            className="mt-2 grid grid-cols-3 gap-1.5"
            role="group"
            aria-label="Stereo voice placement"
          >
            {(
              [
                { id: 'satb', label: 'SATB choir' },
                { id: 'left-to-right', label: 'Left to right' },
                { id: 'random', label: 'Random' },
              ] as const
            ).map((option) => {
              const active = settings.voicePanningMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onUpdate({ voicePanningMode: option.id });
                    onPreviewSound(
                      settings.timbre,
                      settings.ambience,
                      true,
                      option.id,
                    );
                  }}
                  className={`min-h-[40px] rounded-xl border px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
                    active
                      ? 'border-[#4FB3A4] bg-[#4FB3A4]/20 text-[#4FB3A4]'
                      : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Mix volumes + progressive Drone */}
      <div className="space-y-3 border-t border-[#2B323B] pt-4">
        <div>
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="chords-volume-slider"
              className="text-sm font-medium text-[#F3EFE6]"
            >
              Chords volume
            </label>
            <span className="text-sm font-semibold text-[#E5A93C] tabular-nums">
              {Math.round(settings.chordVolume * 100)}%
            </span>
          </div>
          <input
            id="chords-volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.chordVolume}
            onChange={(e) => onUpdate({ chordVolume: Number(e.target.value) })}
            className="studio-slider mt-1"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="voice-volume-slider"
              className="text-sm font-medium text-[#F3EFE6]"
            >
              Voice volume
            </label>
            <span className="text-sm font-semibold text-[#4FB3A4] tabular-nums">
              {Math.round(settings.voiceVolume * 100)}%
            </span>
          </div>
          <input
            id="voice-volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.voiceVolume}
            onChange={(e) => onUpdate({ voiceVolume: Number(e.target.value) })}
            className="studio-slider mt-1"
          />
        </div>

        <div className="border-t border-[#2B323B] pt-3">
          <SwitchRow
            id="toggle-drone"
            label="Enable drone"
            description="Reference tone matched to the active key"
            checked={settings.droneEnabled}
            onChange={(checked) => onUpdate({ droneEnabled: checked })}
          />

          {settings.droneEnabled && (
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex items-baseline justify-between">
                  <label
                    htmlFor="drone-volume-slider"
                    className="text-sm font-medium text-[#F3EFE6]"
                  >
                    Drone volume
                  </label>
                  <span className="text-sm font-semibold text-[#4FB3A4] tabular-nums">
                    {Math.round(settings.droneVolume * 100)}%
                  </span>
                </div>
                <input
                  id="drone-volume-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.droneVolume}
                  onChange={(e) =>
                    onUpdate({ droneVolume: Number(e.target.value) })
                  }
                  className="studio-slider mt-1"
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <span className="block text-sm font-medium text-[#F3EFE6]">
                    Scale tone
                  </span>
                  <span className="text-xs font-medium text-[#4FB3A4] tabular-nums">
                    {showResolvedDroneNote
                      ? `Degree ${settings.droneScaleDegree} · ${droneResolvedPitch}`
                      : `Degree ${settings.droneScaleDegree}`}
                  </span>
                </div>
                <div
                  className="mt-1.5 grid grid-cols-7 gap-1.5"
                  role="group"
                  aria-label="Drone scale tone"
                >
                  {SCALE_DEGREES.map((degree) => {
                    const active = settings.droneScaleDegree === degree;
                    return (
                      <button
                        key={degree}
                        type="button"
                        aria-pressed={active}
                        aria-label={`Scale tone ${degree}`}
                        onClick={() => onUpdate({ droneScaleDegree: degree })}
                        className={`flex min-h-[42px] items-center justify-center rounded-xl border text-sm font-semibold tabular-nums transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
                          active
                            ? 'border-[#4FB3A4] bg-[#4FB3A4]/20 text-[#4FB3A4]'
                            : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                        }`}
                      >
                        {degree}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-[#F3EFE6]">
                  Octave
                </span>
                <div
                  className="mt-1.5 grid grid-cols-4 gap-1.5"
                  role="group"
                  aria-label="Drone octave"
                >
                  {DRONE_OCTAVE_OPTIONS.map((option) => {
                    const active = settings.droneOctave === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onUpdate({ droneOctave: option.value })}
                        className={`min-h-[40px] rounded-xl border px-2 text-xs font-semibold tabular-nums transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
                          active
                            ? 'border-[#4FB3A4] bg-[#4FB3A4]/20 text-[#4FB3A4]'
                            : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
