import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import {
  formatAutoOutputHint,
  OUTPUT_PROFILE_UI_OPTIONS,
  type ResolvedOutputInfo,
} from '../audio/mastering';
import type { SpeechVoiceOption } from '../engine/speech';
import type { AudioOutputProfile, SessionSettings } from '../types/settings';

interface AdvancedSettingsProps {
  settings: SessionSettings;
  resolvedOutputInfo: ResolvedOutputInfo;
  voices: SpeechVoiceOption[];
  onUpdate: (patch: Partial<SessionSettings>) => void;
  onPreviewOutputProfile?: (profile: AudioOutputProfile) => void;
  onRefreshOutputProfile?: () => void;
}

export function AdvancedSettings({
  settings,
  resolvedOutputInfo,
  voices,
  onUpdate,
  onPreviewOutputProfile,
  onRefreshOutputProfile,
}: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section
      aria-label="Advanced settings"
      className="mt-3 rounded-2xl border border-[#2B323B] bg-[#1B1F24]"
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="advanced-settings-panel"
        onClick={() =>
          setIsOpen((prev) => {
            const next = !prev;
            if (next) onRefreshOutputProfile?.();
            return next;
          })
        }
        className="flex min-h-[52px] w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
      >
        <span>Advanced settings</span>
        <ChevronDown
          className={`h-4 w-4 text-[#9CA3AE] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          id="advanced-settings-panel"
          className="space-y-3.5 border-t border-[#2B323B] px-4 pb-5 pt-4"
        >
          <h3 className="text-xs font-semibold text-[#9CA3AE]">
            Timing &amp; speech
          </h3>

            <div>
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="repeat-pause-slider"
                  className="text-sm font-medium text-[#F3EFE6]"
                >
                  Pause between repeats
                </label>
                <span className="text-sm font-semibold text-[#E5A93C] tabular-nums">
                  {settings.repeatPauseSec.toFixed(1)}s
                </span>
              </div>
              <input
                id="repeat-pause-slider"
                type="range"
                min={0.4}
                max={3.0}
                step={0.1}
                value={settings.repeatPauseSec}
                onChange={(e) =>
                  onUpdate({ repeatPauseSec: Number(e.target.value) })
                }
                className="studio-slider mt-1"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="speech-rate-slider"
                  className="text-sm font-medium text-[#F3EFE6]"
                >
                  Speech rate
                </label>
                <span className="text-sm font-semibold text-[#E5A93C] tabular-nums">
                  {settings.speechRate.toFixed(2)}×
                </span>
              </div>
              <input
                id="speech-rate-slider"
                type="range"
                min={0.7}
                max={1.4}
                step={0.05}
                value={settings.speechRate}
                onChange={(e) =>
                  onUpdate({ speechRate: Number(e.target.value) })
                }
                className="studio-slider mt-1"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-[#F3EFE6]">
                viiø7 spoken naming
              </span>
              <div
                className="mt-1.5 grid grid-cols-2 gap-1.5"
                role="group"
                aria-label="Half-diminished chord naming"
              >
                {(
                  [
                    { id: 'half-diminished', label: 'Half diminished' },
                    { id: 'minor-seven-flat-five', label: 'Minor 7♭5' },
                  ] as const
                ).map((option) => {
                  const active = settings.halfDimNaming === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onUpdate({ halfDimNaming: option.id })}
                      className={`min-h-[42px] rounded-xl border px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
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
              <p className="mt-1.5 text-xs text-[#9CA3AE]">
                Speaks &ldquo;
                {settings.halfDimNaming === 'minor-seven-flat-five'
                  ? 'Seven minor seven flat five'
                  : 'Seven half diminished'}
                &rdquo;
              </p>
            </div>

            <div>
              <span className="block text-sm font-medium text-[#F3EFE6]">
                Voice source
              </span>
              <div
                className="mt-1.5 grid grid-cols-2 gap-1.5"
                role="group"
                aria-label="Voice source"
              >
                {(
                  [
                    { id: 'recorded', label: 'Built-in (Pocket)' },
                    { id: 'speech-synthesis', label: 'Browser TTS' },
                  ] as const
                ).map((option) => {
                  const active = settings.voiceSource === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onUpdate({ voiceSource: option.id })}
                      className={`min-h-[42px] rounded-xl border px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
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
              {settings.voiceSource === 'recorded' && (
                <p className="mt-1.5 text-xs text-[#9CA3AE]">
                  Plays through Web Audio. Works when your iPhone screen is
                  locked.
                </p>
              )}
            </div>

            {settings.voiceSource === 'speech-synthesis' && (
              <div>
                <label
                  htmlFor="speech-voice-select"
                  className="block text-sm font-medium text-[#F3EFE6]"
                >
                  Voice
                </label>
                <select
                  id="speech-voice-select"
                  value={settings.speechVoiceURI ?? ''}
                  onChange={(e) =>
                    onUpdate({
                      speechVoiceURI: e.target.value ? e.target.value : null,
                    })
                  }
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#343C47] bg-[#252B33] px-3 text-sm text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
                >
                  <option value="">Auto (system default)</option>
                  {voices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="border-t border-[#2B323B] pt-3.5">
              <span className="block text-sm font-medium text-[#F3EFE6]">
                Audio output
              </span>
              <div
                className="mt-1.5 grid grid-cols-3 gap-1.5"
                role="group"
                aria-label="Audio output profile"
              >
                {OUTPUT_PROFILE_UI_OPTIONS.map((option) => {
                  const active = settings.outputProfile === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        onUpdate({ outputProfile: option.id });
                        onPreviewOutputProfile?.(option.id);
                      }}
                      className={`min-h-[42px] rounded-xl border px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
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
              {settings.outputProfile === 'auto' && (
                <p
                  data-testid="auto-output-hint"
                  className="mt-1.5 text-xs font-medium text-[#4FB3A4]"
                >
                  {formatAutoOutputHint(resolvedOutputInfo)}
                </p>
              )}
              <p
                className={`${settings.outputProfile === 'auto' ? 'mt-1' : 'mt-1.5'} text-xs text-[#9CA3AE]`}
              >
                {
                  OUTPUT_PROFILE_UI_OPTIONS.find(
                    (o) => o.id === settings.outputProfile,
                  )?.description
                }
              </p>
            </div>
        </div>
      )}
    </section>
  );
}
