import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import {
  ALL_SECONDARY_DOMINANT_IDS,
  CHORD_DEFS,
  CHORD_PRESETS,
  formatChordDisplay,
  getAllowedInversionsForChord,
  getSpokenChordPhrase,
  isSecondaryDominantId,
  isSeventhChordId,
  SECONDARY_DOMINANT_PRESETS,
  SECONDARY_SEVENTH_IDS,
  SECONDARY_TRIAD_IDS,
  SEVENTH_IDS,
  TRIAD_IDS,
} from '../music/chords';
import type {
  ChordId,
  ChordInversion,
  DiatonicChordId,
  InversionNotation,
  SecondaryDominantId,
  SeventhInversion,
  TriadInversion,
} from '../types/settings';
import { SwitchRow } from './SwitchRow';

interface ChordSelectorProps {
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
  announceTriadQuality: boolean;
  playChordsBehindAnswer: boolean;
  onChange: (next: DiatonicChordId[]) => void;
  onToggleSecondaryDominants: (enabled: boolean) => void;
  onChangeSecondaryDominants: (next: SecondaryDominantId[]) => void;
  onToggleStrictSecondaryResolution: (enabled: boolean) => void;
  onChangeTriadInversions: (next: TriadInversion[]) => void;
  onChangeSeventhInversions: (next: SeventhInversion[]) => void;
  onChangeChordInversionOverrides: (
    next: Partial<Record<ChordId, ChordInversion[]>>,
  ) => void;
  onChangeInversionNotation: (next: InversionNotation) => void;
  onToggleMusicalInversionLeading: (enabled: boolean) => void;
  onToggleMelody: (enabled: boolean) => void;
  onToggleMelodyAllowTensions: (enabled: boolean) => void;
  onChangeMelodyVolume: (volume: number) => void;
  onToggleTriadQuality: (enabled: boolean) => void;
  onToggleChordsBehindAnswer: (enabled: boolean) => void;
}

const TRIAD_INVERSION_OPTIONS: readonly {
  inv: TriadInversion;
  label: string;
  shortLabel: string;
  spokenName: string;
}[] = [
  { inv: 0, label: 'Root', shortLabel: 'R', spokenName: 'root position' },
  { inv: 1, label: '1st', shortLabel: '1st', spokenName: 'first inversion' },
  { inv: 2, label: '2nd', shortLabel: '2nd', spokenName: 'second inversion' },
];

const SEVENTH_INVERSION_OPTIONS: readonly {
  inv: SeventhInversion;
  label: string;
  shortLabel: string;
  spokenName: string;
}[] = [
  ...TRIAD_INVERSION_OPTIONS,
  { inv: 3, label: '3rd', shortLabel: '3rd', spokenName: 'third inversion' },
];

function setsMatch<T extends string | number>(
  a: readonly T[],
  b: readonly T[],
): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

function getInversionSummary(
  triadInversions: readonly TriadInversion[],
  seventhInversions: readonly SeventhInversion[],
  overrideCount: number,
): string {
  const triadDefaultRootOnly =
    triadInversions.length === 1 && triadInversions[0] === 0;
  const seventhDefaultRootOnly =
    seventhInversions.length === 1 && seventhInversions[0] === 0;

  if (triadDefaultRootOnly && seventhDefaultRootOnly && overrideCount === 0) {
    return 'Root only';
  }

  const parts: string[] = [];
  if (!triadDefaultRootOnly) {
    const labels = triadInversions.map((i) =>
      i === 0 ? 'R' : `${i}${i === 1 ? 'st' : 'nd'}`,
    );
    parts.push(`Triads: ${labels.join('/')}`);
  }
  if (!seventhDefaultRootOnly) {
    const labels = seventhInversions.map((i) =>
      i === 0 ? 'R' : i === 1 ? '1st' : i === 2 ? '2nd' : '3rd',
    );
    parts.push(`7ths: ${labels.join('/')}`);
  }
  if (overrideCount > 0) {
    parts.push(`${overrideCount} custom`);
  }
  return parts.join(' · ');
}

export function ChordSelector({
  allowedChords,
  secondaryDominantsEnabled,
  allowedSecondaryDominants,
  strictSecondaryResolution,
  triadInversions,
  seventhInversions,
  chordInversionOverrides,
  inversionNotation,
  musicalInversionLeading,
  melodyEnabled,
  melodyAllowTensions,
  melodyVolume,
  announceTriadQuality,
  playChordsBehindAnswer,
  onChange,
  onToggleSecondaryDominants,
  onChangeSecondaryDominants,
  onToggleStrictSecondaryResolution,
  onChangeTriadInversions,
  onChangeSeventhInversions,
  onChangeChordInversionOverrides,
  onChangeInversionNotation,
  onToggleMusicalInversionLeading,
  onToggleMelody,
  onToggleMelodyAllowTensions,
  onChangeMelodyVolume,
  onToggleTriadQuality,
  onToggleChordsBehindAnswer,
}: ChordSelectorProps) {
  const [minGuardNotice, setMinGuardNotice] = useState(false);
  const [secMinGuardNotice, setSecMinGuardNotice] = useState(false);
  const [inversionsOpen, setInversionsOpen] = useState(false);
  const [perChordOpen, setPerChordOpen] = useState(false);
  const [triadsOverridesOpen, setTriadsOverridesOpen] = useState(false);
  const [seventhsOverridesOpen, setSeventhsOverridesOpen] = useState(false);
  const [secondaryOverridesOpen, setSecondaryOverridesOpen] = useState(false);
  const [secTriadsOverridesOpen, setSecTriadsOverridesOpen] = useState(false);
  const [secSeventhsOverridesOpen, setSecSeventhsOverridesOpen] =
    useState(false);
  const [invGuardNotice, setInvGuardNotice] = useState(false);

  const selectedSet = new Set<ChordId>(allowedChords);
  const selectedSecondarySet = new Set<ChordId>(allowedSecondaryDominants);

  const toggleChord = (id: DiatonicChordId) => {
    if (selectedSet.has(id)) {
      if (allowedChords.length <= 1) {
        setMinGuardNotice(true);
        return;
      }
      setMinGuardNotice(false);
      onChange(allowedChords.filter((item) => item !== id));
    } else {
      setMinGuardNotice(false);
      onChange([...allowedChords, id]);
    }
  };

  const toggleSecondaryDominant = (id: SecondaryDominantId) => {
    if (selectedSecondarySet.has(id)) {
      if (allowedSecondaryDominants.length <= 1) {
        setSecMinGuardNotice(true);
        return;
      }
      setSecMinGuardNotice(false);
      onChangeSecondaryDominants(
        allowedSecondaryDominants.filter((item) => item !== id),
      );
    } else {
      setSecMinGuardNotice(false);
      onChangeSecondaryDominants([...allowedSecondaryDominants, id]);
    }
  };

  const toggleGlobalTriadInversion = (inv: TriadInversion) => {
    const active = triadInversions.includes(inv);
    if (active) {
      if (triadInversions.length <= 1) {
        setInvGuardNotice(true);
        return;
      }
      setInvGuardNotice(false);
      onChangeTriadInversions(triadInversions.filter((x) => x !== inv));
    } else {
      setInvGuardNotice(false);
      onChangeTriadInversions(
        [...triadInversions, inv].sort((a, b) => a - b) as TriadInversion[],
      );
    }
  };

  const toggleGlobalSeventhInversion = (inv: SeventhInversion) => {
    const active = seventhInversions.includes(inv);
    if (active) {
      if (seventhInversions.length <= 1) {
        setInvGuardNotice(true);
        return;
      }
      setInvGuardNotice(false);
      onChangeSeventhInversions(seventhInversions.filter((x) => x !== inv));
    } else {
      setInvGuardNotice(false);
      onChangeSeventhInversions(
        [...seventhInversions, inv].sort(
          (a, b) => a - b,
        ) as SeventhInversion[],
      );
    }
  };

  const toggleChordInversionOverride = (
    chordId: ChordId,
    inv: ChordInversion,
  ) => {
    const isSeventh = isSeventhChordId(chordId);
    const globalDefault: ChordInversion[] = isSeventh
      ? [...seventhInversions]
      : [...triadInversions];
    const current = getAllowedInversionsForChord(chordId, {
      triadInversions,
      seventhInversions,
      chordInversionOverrides,
    });
    const isActive = current.includes(inv);
    if (isActive && current.length <= 1) {
      setInvGuardNotice(true);
      return;
    }
    setInvGuardNotice(false);
    const next = isActive
      ? current.filter((x) => x !== inv)
      : ([...current, inv].sort((a, b) => a - b) as ChordInversion[]);

    const updated = { ...chordInversionOverrides };
    if (setsMatch(next, globalDefault)) {
      delete updated[chordId];
    } else {
      updated[chordId] = next;
    }
    onChangeChordInversionOverrides(updated);
  };

  const resetChordOverride = (chordId: ChordId) => {
    setInvGuardNotice(false);
    const updated = { ...chordInversionOverrides };
    delete updated[chordId];
    onChangeChordInversionOverrides(updated);
  };

  const isChordCurrentlyActive = (id: ChordId): boolean =>
    isSecondaryDominantId(id)
      ? secondaryDominantsEnabled && selectedSecondarySet.has(id)
      : selectedSet.has(id);

  const countGroupOverrides = (ids: readonly ChordId[]): number =>
    ids.filter((id) => (chordInversionOverrides[id]?.length ?? 0) > 0).length;

  const resetGroupOverrides = (ids: readonly ChordId[]) => {
    setInvGuardNotice(false);
    const updated = { ...chordInversionOverrides };
    for (const id of ids) {
      delete updated[id];
    }
    onChangeChordInversionOverrides(updated);
  };

  const overrideCount = Object.keys(chordInversionOverrides).length;
  const triadOverrideCount = countGroupOverrides(TRIAD_IDS);
  const seventhOverrideCount = countGroupOverrides(SEVENTH_IDS);
  const secTriadOverrideCount = countGroupOverrides(SECONDARY_TRIAD_IDS);
  const secSeventhOverrideCount = countGroupOverrides(SECONDARY_SEVENTH_IDS);
  const secondaryOverrideCount = countGroupOverrides(ALL_SECONDARY_DOMINANT_IDS);

  const hasActiveTriad = TRIAD_IDS.some((id) => selectedSet.has(id));
  const hasActiveSeventh = SEVENTH_IDS.some((id) => selectedSet.has(id));

  const renderChordOverrideRow = (id: ChordId) => {
    const def = CHORD_DEFS[id];
    const isSeventh = isSeventhChordId(id);
    const isActiveInSession = isChordCurrentlyActive(id);
    const options = isSeventh
      ? SEVENTH_INVERSION_OPTIONS
      : TRIAD_INVERSION_OPTIONS;
    const effective = getAllowedInversionsForChord(id, {
      triadInversions,
      seventhInversions,
      chordInversionOverrides,
    });
    const isOverridden = (chordInversionOverrides[id]?.length ?? 0) > 0;

    return (
      <div
        key={id}
        className="flex items-center gap-1.5 rounded-xl border border-[#2B323B] bg-[#1B1F24] px-2 py-1.5"
      >
        <span
          title={
            isActiveInSession
              ? undefined
              : `${def.symbol} is not currently enabled in Allowed chords`
          }
          className={`w-[52px] shrink-0 font-roman text-xs sm:text-sm font-semibold ${
            isActiveInSession
              ? isSeventh
                ? 'text-[#4FB3A4]'
                : 'text-[#E5A93C]'
              : 'text-[#9CA3AE]'
          }`}
        >
          {def.symbol}
        </span>
        <div className="flex flex-1 gap-1">
          {options.map((opt) => {
            const active = effective.includes(opt.inv);
            const activeClass = isSeventh
              ? isOverridden
                ? 'border-[#4FB3A4] bg-[#4FB3A4]/25 text-[#4FB3A4]'
                : 'border-[#4FB3A4]/45 bg-[#4FB3A4]/10 text-[#4FB3A4]/85'
              : isOverridden
                ? 'border-[#E5A93C] bg-[#E5A93C]/25 text-[#E5A93C]'
                : 'border-[#E5A93C]/45 bg-[#E5A93C]/10 text-[#E5A93C]/85';

            return (
              <button
                key={opt.inv}
                type="button"
                aria-pressed={active}
                aria-label={`${def.symbol} ${opt.spokenName}`}
                onClick={() => toggleChordInversionOverride(id, opt.inv)}
                className={`min-h-[32px] flex-1 rounded-lg border px-1 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C] ${
                  active
                    ? activeClass
                    : 'border-[#343C47] bg-[#252B33] text-[#7D8590] hover:text-[#F3EFE6]'
                }`}
              >
                {opt.shortLabel}
              </button>
            );
          })}
        </div>
        <div className="w-11 shrink-0 text-right">
          {isOverridden ? (
            <button
              type="button"
              aria-label={`Reset ${def.symbol} inversions`}
              onClick={() => resetChordOverride(id)}
              className="text-[11px] font-medium text-[#E5A93C] hover:underline"
            >
              Reset
            </button>
          ) : (
            <span className="text-[11px] text-[#7D8590]">Default</span>
          )}
        </div>
      </div>
    );
  };

  const hasAutoResolvedTarget =
    secondaryDominantsEnabled &&
    strictSecondaryResolution &&
    allowedSecondaryDominants.some((secId) => {
      const targets = CHORD_DEFS[secId].resolvesTo;
      return targets ? targets.every((t) => !selectedSet.has(t)) : false;
    });

  const activeCountLabel = secondaryDominantsEnabled
    ? `${allowedChords.length} + ${allowedSecondaryDominants.length} active`
    : `${allowedChords.length} active`;

  const exampleTriadDisplay = formatChordDisplay('I', 1, inversionNotation);
  const exampleTriadSpoken = getSpokenChordPhrase(
    'I',
    'half-diminished',
    false,
    1,
    inversionNotation,
  ).text;
  const exampleSeventhDisplay = formatChordDisplay('V7', 3, inversionNotation);
  const exampleSeventhSpoken = getSpokenChordPhrase(
    'V7',
    'half-diminished',
    false,
    3,
    inversionNotation,
  ).text;

  return (
    <section
      aria-label="Allowed chords"
      className="mt-4 rounded-2xl border border-[#2B323B] bg-[#1B1F24] p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#F3EFE6]">Allowed chords</h2>
        <span className="text-xs text-[#9CA3AE] tabular-nums">
          {activeCountLabel}
        </span>
      </div>

      {/* Quick-select presets */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {CHORD_PRESETS.map((preset) => {
          const isCurrent = setsMatch(allowedChords, preset.chords);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setMinGuardNotice(false);
                onChange([...preset.chords]);
              }}
              className={`min-h-[34px] rounded-lg border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C] ${
                isCurrent
                  ? 'border-[#E5A93C]/70 bg-[#E5A93C]/15 text-[#E5A93C]'
                  : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Triads row */}
      <div className="mt-3.5">
        <p className="mb-1.5 text-xs font-medium text-[#9CA3AE]">Triads</p>
        <div className="grid grid-cols-7 gap-1.5">
          {TRIAD_IDS.map((id) => {
            const def = CHORD_DEFS[id];
            const active = selectedSet.has(id);
            const hasOverride =
              (chordInversionOverrides[id]?.length ?? 0) > 0;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                aria-label={`Triad ${def.symbol} (${def.spokenQualityLabel ?? def.spokenLabel})`}
                title={hasOverride ? 'Custom inversion override' : undefined}
                onClick={() => toggleChord(id)}
                className={`relative flex min-h-[48px] items-center justify-center rounded-xl border font-roman text-base sm:text-lg font-semibold transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C] ${
                  active
                    ? 'border-[#E5A93C] bg-[#E5A93C]/20 text-[#E5A93C]'
                    : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                }`}
              >
                {def.symbol}
                {hasOverride && (
                  <span
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-current"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Seventh chords row */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-[#9CA3AE]">Seventh chords</p>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
          {SEVENTH_IDS.map((id) => {
            const def = CHORD_DEFS[id];
            const active = selectedSet.has(id);
            const hasOverride =
              (chordInversionOverrides[id]?.length ?? 0) > 0;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                aria-label={`Seventh ${def.symbol} (${def.spokenLabel})`}
                title={hasOverride ? 'Custom inversion override' : undefined}
                onClick={() => toggleChord(id)}
                className={`relative flex min-h-[48px] items-center justify-center rounded-xl border px-1 font-roman text-sm sm:text-[15px] font-semibold transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
                  active
                    ? 'border-[#4FB3A4] bg-[#4FB3A4]/20 text-[#4FB3A4]'
                    : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                }`}
              >
                {def.symbol}
                {hasOverride && (
                  <span
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-current"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {minGuardNotice && (
        <p className="mt-2.5 text-xs text-[#E5A93C]" role="status">
          Keep at least one chord active.
        </p>
      )}

      {/* Progressive Secondary Dominants drawer */}
      <div className="mt-4 border-t border-[#2B323B] pt-3.5">
        <SwitchRow
          id="toggle-secondary-dominants"
          label="Secondary dominants"
          description={
            secondaryDominantsEnabled
              ? strictSecondaryResolution
                ? 'Resolves directly to each target chord'
                : 'Secondary dominants can appear anywhere in the progression'
              : 'Add tonicized V/x triads and V7/x dominant sevenths'
          }
          checked={secondaryDominantsEnabled}
          onChange={(enabled) => {
            setSecMinGuardNotice(false);
            onToggleSecondaryDominants(enabled);
          }}
        />

        {secondaryDominantsEnabled && (
          <div className="mt-3 rounded-xl border border-[#2B323B] bg-[#16191D] p-3">
            <div className="flex flex-wrap gap-1.5">
              {SECONDARY_DOMINANT_PRESETS.map((preset) => {
                const isCurrent = setsMatch(
                  allowedSecondaryDominants,
                  preset.chords,
                );
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSecMinGuardNotice(false);
                      onChangeSecondaryDominants([...preset.chords]);
                    }}
                    className={`min-h-[32px] rounded-lg border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C] ${
                      isCurrent
                        ? 'border-[#E5A93C]/70 bg-[#E5A93C]/15 text-[#E5A93C]'
                        : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <p className="text-xs font-medium text-[#9CA3AE]">Triads</p>
                <span className="text-[11px] text-[#7D8590]">
                  V/IV triad is identical to I
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {SECONDARY_TRIAD_IDS.map((id) => {
                  const def = CHORD_DEFS[id];
                  const active = selectedSecondarySet.has(id);
                  const hasOverride =
                    (chordInversionOverrides[id]?.length ?? 0) > 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Secondary dominant triad ${def.symbol} (${def.spokenLabel})`}
                      title={hasOverride ? 'Custom inversion override' : undefined}
                      onClick={() => toggleSecondaryDominant(id)}
                      className={`relative flex min-h-[44px] items-center justify-center rounded-xl border px-1 font-roman text-sm sm:text-base font-semibold transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C] ${
                        active
                          ? 'border-[#E5A93C] bg-[#E5A93C]/20 text-[#E5A93C]'
                          : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                      }`}
                    >
                      {def.symbol}
                      {hasOverride && (
                        <span
                          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-current"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-[#9CA3AE]">
                Dominant 7ths
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {SECONDARY_SEVENTH_IDS.map((id) => {
                  const def = CHORD_DEFS[id];
                  const active = selectedSecondarySet.has(id);
                  const hasOverride =
                    (chordInversionOverrides[id]?.length ?? 0) > 0;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Secondary dominant seventh ${def.symbol} (${def.spokenLabel})`}
                      title={hasOverride ? 'Custom inversion override' : undefined}
                      onClick={() => toggleSecondaryDominant(id)}
                      className={`relative flex min-h-[44px] items-center justify-center rounded-xl border px-1 font-roman text-xs sm:text-sm font-semibold transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
                        active
                          ? 'border-[#4FB3A4] bg-[#4FB3A4]/20 text-[#4FB3A4]'
                          : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                      }`}
                    >
                      {def.symbol}
                      {hasOverride && (
                        <span
                          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-current"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {secMinGuardNotice && (
              <p className="mt-2.5 text-xs text-[#E5A93C]" role="status">
                Keep at least one secondary dominant active, or turn the toggle off.
              </p>
            )}

            <div className="mt-3 border-t border-[#2B323B] pt-3">
              <SwitchRow
                id="toggle-strict-secondary-resolution"
                label="Strict resolution"
                description={
                  strictSecondaryResolution
                    ? 'Always resolves to its target chord (never last)'
                    : 'Moves freely, including deceptive moves or ending chords'
                }
                checked={strictSecondaryResolution}
                onChange={onToggleStrictSecondaryResolution}
              />
            </div>

            {hasAutoResolvedTarget && (
              <p className="mt-2 text-[11px] leading-relaxed text-[#9CA3AE]">
                Unchecked resolution targets still play automatically after their secondary dominant.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Collapsible Inversions section */}
      <div className="mt-4 border-t border-[#2B323B] pt-2">
        <button
          type="button"
          aria-expanded={inversionsOpen}
          aria-controls="inversions-panel"
          onClick={() => setInversionsOpen((prev) => !prev)}
          className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
        >
          <span className="text-sm font-medium text-[#F3EFE6]">Inversions</span>
          <span className="flex items-center gap-2 text-xs text-[#9CA3AE]">
            <span className="tabular-nums">
              {getInversionSummary(
                triadInversions,
                seventhInversions,
                overrideCount,
              )}
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                inversionsOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </span>
        </button>

        {inversionsOpen && (
          <div
            id="inversions-panel"
            className="mt-2 space-y-3.5 rounded-xl border border-[#2B323B] bg-[#16191D] p-3"
          >
            {/* Global Triad defaults */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-[#9CA3AE]">
                Triads default
              </p>
              <div
                className="grid grid-cols-3 gap-1.5"
                role="group"
                aria-label="Triad inversions default"
              >
                {TRIAD_INVERSION_OPTIONS.map((opt) => {
                  const active = triadInversions.includes(opt.inv);
                  return (
                    <button
                      key={opt.inv}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleGlobalTriadInversion(opt.inv)}
                      className={`min-h-[38px] rounded-xl border px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C] ${
                        active
                          ? 'border-[#E5A93C] bg-[#E5A93C]/20 text-[#E5A93C]'
                          : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Global Seventh defaults */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-[#9CA3AE]">
                Sevenths default
              </p>
              <div
                className="grid grid-cols-4 gap-1.5"
                role="group"
                aria-label="Seventh inversions default"
              >
                {SEVENTH_INVERSION_OPTIONS.map((opt) => {
                  const active = seventhInversions.includes(opt.inv);
                  return (
                    <button
                      key={opt.inv}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleGlobalSeventhInversion(opt.inv)}
                      className={`min-h-[38px] rounded-xl border px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
                        active
                          ? 'border-[#4FB3A4] bg-[#4FB3A4]/20 text-[#4FB3A4]'
                          : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Expandable Customize per chord matrix */}
            <div className="border-t border-[#2B323B] pt-2.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded={perChordOpen}
                  aria-controls="inversions-per-chord-matrix"
                  onClick={() => setPerChordOpen((prev) => !prev)}
                  className="flex min-h-[36px] flex-1 items-center justify-between gap-2 rounded-lg text-left text-xs font-medium text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
                >
                  <span>Customize per chord</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-[#9CA3AE]">
                    <span>
                      {overrideCount === 0
                        ? 'Using defaults'
                        : `${overrideCount} override${overrideCount === 1 ? '' : 's'}`}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${
                        perChordOpen ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </span>
                </button>
                {overrideCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setInvGuardNotice(false);
                      onChangeChordInversionOverrides({});
                    }}
                    className="rounded-lg border border-[#343C47] bg-[#252B33] px-2 py-1 text-[11px] font-medium text-[#9CA3AE] hover:text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
                  >
                    Reset all
                  </button>
                )}
              </div>

              {perChordOpen && (
                <div
                  id="inversions-per-chord-matrix"
                  className="mt-2.5 space-y-2"
                >
                  {/* Level 2a: Triads */}
                  <div className="rounded-xl border border-[#2B323B] bg-[#1B1F24]/70">
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                      <button
                        type="button"
                        aria-expanded={triadsOverridesOpen}
                        aria-controls="inversions-group-triads"
                        onClick={() => setTriadsOverridesOpen((prev) => !prev)}
                        className="flex min-h-[34px] flex-1 items-center justify-between gap-2 rounded-lg text-left text-xs font-medium text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
                      >
                        <span>Triads</span>
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <span
                            className={
                              triadOverrideCount > 0
                                ? 'text-[#E5A93C]'
                                : 'text-[#7D8590]'
                            }
                          >
                            {triadOverrideCount > 0
                              ? `${triadOverrideCount} custom`
                              : 'Default'}
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-[#9CA3AE] transition-transform ${
                              triadsOverridesOpen ? 'rotate-180' : ''
                            }`}
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                      {triadOverrideCount > 0 && (
                        <button
                          type="button"
                          aria-label="Reset triad overrides"
                          onClick={() => resetGroupOverrides(TRIAD_IDS)}
                          className="rounded-lg border border-[#343C47] bg-[#252B33] px-2 py-1 text-[11px] font-medium text-[#9CA3AE] hover:text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    {triadsOverridesOpen && (
                      <div
                        id="inversions-group-triads"
                        className="space-y-1.5 border-t border-[#2B323B] px-2 pb-2 pt-2"
                      >
                        {!hasActiveTriad && (
                          <p className="px-1 text-[11px] leading-relaxed text-[#7D8590]">
                            Select triads above to include them in progressions.
                          </p>
                        )}
                        {TRIAD_IDS.map(renderChordOverrideRow)}
                      </div>
                    )}
                  </div>

                  {/* Level 2b: Seventh chords */}
                  <div className="rounded-xl border border-[#2B323B] bg-[#1B1F24]/70">
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                      <button
                        type="button"
                        aria-expanded={seventhsOverridesOpen}
                        aria-controls="inversions-group-sevenths"
                        onClick={() =>
                          setSeventhsOverridesOpen((prev) => !prev)
                        }
                        className="flex min-h-[34px] flex-1 items-center justify-between gap-2 rounded-lg text-left text-xs font-medium text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4]"
                      >
                        <span>Seventh chords</span>
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <span
                            className={
                              seventhOverrideCount > 0
                                ? 'text-[#4FB3A4]'
                                : 'text-[#7D8590]'
                            }
                          >
                            {seventhOverrideCount > 0
                              ? `${seventhOverrideCount} custom`
                              : 'Default'}
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-[#9CA3AE] transition-transform ${
                              seventhsOverridesOpen ? 'rotate-180' : ''
                            }`}
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                      {seventhOverrideCount > 0 && (
                        <button
                          type="button"
                          aria-label="Reset seventh chord overrides"
                          onClick={() => resetGroupOverrides(SEVENTH_IDS)}
                          className="rounded-lg border border-[#343C47] bg-[#252B33] px-2 py-1 text-[11px] font-medium text-[#9CA3AE] hover:text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4]"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    {seventhsOverridesOpen && (
                      <div
                        id="inversions-group-sevenths"
                        className="space-y-1.5 border-t border-[#2B323B] px-2 pb-2 pt-2"
                      >
                        {!hasActiveSeventh && (
                          <p className="px-1 text-[11px] leading-relaxed text-[#7D8590]">
                            Select seventh chords above to include them in progressions.
                          </p>
                        )}
                        {SEVENTH_IDS.map(renderChordOverrideRow)}
                      </div>
                    )}
                  </div>

                  {/* Level 2c: Secondary dominants */}
                  <div className="rounded-xl border border-[#2B323B] bg-[#1B1F24]/70">
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                      <button
                        type="button"
                        aria-expanded={secondaryOverridesOpen}
                        aria-controls="inversions-group-secondary"
                        onClick={() =>
                          setSecondaryOverridesOpen((prev) => !prev)
                        }
                        className="flex min-h-[34px] flex-1 items-center justify-between gap-2 rounded-lg text-left text-xs font-medium text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
                      >
                        <span>Secondary dominants</span>
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <span
                            className={
                              secondaryOverrideCount > 0
                                ? 'text-[#F3EFE6]'
                                : 'text-[#7D8590]'
                            }
                          >
                            {secondaryOverrideCount > 0
                              ? `${secondaryOverrideCount} custom`
                              : 'Default'}
                          </span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-[#9CA3AE] transition-transform ${
                              secondaryOverridesOpen ? 'rotate-180' : ''
                            }`}
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                      {secondaryOverrideCount > 0 && (
                        <button
                          type="button"
                          aria-label="Reset secondary dominant overrides"
                          onClick={() =>
                            resetGroupOverrides(ALL_SECONDARY_DOMINANT_IDS)
                          }
                          className="rounded-lg border border-[#343C47] bg-[#252B33] px-2 py-1 text-[11px] font-medium text-[#9CA3AE] hover:text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    {secondaryOverridesOpen && (
                      <div
                        id="inversions-group-secondary"
                        className="space-y-1.5 border-t border-[#2B323B] px-1.5 pb-2 pt-2"
                      >
                        {!secondaryDominantsEnabled && (
                          <p className="px-1 text-[11px] leading-relaxed text-[#7D8590]">
                            Turn on Secondary dominants above to include these chords in progressions.
                          </p>
                        )}

                        {/* Level 3a: Secondary dominant triads (V/x) */}
                        <div
                          className={
                            !secondaryDominantsEnabled
                              ? 'border-t border-[#2B323B] pt-1.5'
                              : ''
                          }
                        >
                          <div className="flex items-center justify-between gap-2 px-1 py-1">
                            <button
                              type="button"
                              aria-expanded={secTriadsOverridesOpen}
                              aria-controls="inversions-group-secondary-triads"
                              onClick={() =>
                                setSecTriadsOverridesOpen((prev) => !prev)
                              }
                              className="flex min-h-[32px] flex-1 items-center justify-between gap-2 rounded-lg text-left text-xs font-medium text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
                            >
                              <span>
                                Triads{' '}
                                <span className="ml-1 font-roman text-[11px] text-[#7D8590]">
                                  V/x
                                </span>
                              </span>
                              <span className="flex items-center gap-1.5 text-[11px]">
                                <span
                                  className={
                                    secTriadOverrideCount > 0
                                      ? 'text-[#E5A93C]'
                                      : 'text-[#7D8590]'
                                  }
                                >
                                  {secTriadOverrideCount > 0
                                    ? `${secTriadOverrideCount} custom`
                                    : 'Default'}
                                </span>
                                <ChevronDown
                                  className={`h-3.5 w-3.5 text-[#9CA3AE] transition-transform ${
                                    secTriadsOverridesOpen ? 'rotate-180' : ''
                                  }`}
                                  aria-hidden="true"
                                />
                              </span>
                            </button>
                            {secTriadOverrideCount > 0 && (
                              <button
                                type="button"
                                aria-label="Reset secondary triad overrides"
                                onClick={() =>
                                  resetGroupOverrides(SECONDARY_TRIAD_IDS)
                                }
                                className="rounded-lg border border-[#343C47] bg-[#252B33] px-2 py-1 text-[11px] font-medium text-[#9CA3AE] hover:text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C]"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                          {secTriadsOverridesOpen && (
                            <div
                              id="inversions-group-secondary-triads"
                              className="space-y-1.5 pt-1.5 pb-1"
                            >
                              {SECONDARY_TRIAD_IDS.map(renderChordOverrideRow)}
                            </div>
                          )}
                        </div>

                        {/* Level 3b: Secondary dominant sevenths (V7/x) */}
                        <div className="border-t border-[#2B323B] pt-1.5">
                          <div className="flex items-center justify-between gap-2 px-1 py-1">
                            <button
                              type="button"
                              aria-expanded={secSeventhsOverridesOpen}
                              aria-controls="inversions-group-secondary-sevenths"
                              onClick={() =>
                                setSecSeventhsOverridesOpen((prev) => !prev)
                              }
                              className="flex min-h-[32px] flex-1 items-center justify-between gap-2 rounded-lg text-left text-xs font-medium text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4]"
                            >
                              <span>
                                Dominant 7ths{' '}
                                <span className="ml-1 font-roman text-[11px] text-[#7D8590]">
                                  V7/x
                                </span>
                              </span>
                              <span className="flex items-center gap-1.5 text-[11px]">
                                <span
                                  className={
                                    secSeventhOverrideCount > 0
                                      ? 'text-[#4FB3A4]'
                                      : 'text-[#7D8590]'
                                  }
                                >
                                  {secSeventhOverrideCount > 0
                                    ? `${secSeventhOverrideCount} custom`
                                    : 'Default'}
                                </span>
                                <ChevronDown
                                  className={`h-3.5 w-3.5 text-[#9CA3AE] transition-transform ${
                                    secSeventhsOverridesOpen ? 'rotate-180' : ''
                                  }`}
                                  aria-hidden="true"
                                />
                              </span>
                            </button>
                            {secSeventhOverrideCount > 0 && (
                              <button
                                type="button"
                                aria-label="Reset secondary dominant seventh overrides"
                                onClick={() =>
                                  resetGroupOverrides(SECONDARY_SEVENTH_IDS)
                                }
                                className="rounded-lg border border-[#343C47] bg-[#252B33] px-2 py-1 text-[11px] font-medium text-[#9CA3AE] hover:text-[#F3EFE6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4]"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                          {secSeventhsOverridesOpen && (
                            <div
                              id="inversions-group-secondary-sevenths"
                              className="space-y-1.5 pt-1.5 pb-0.5"
                            >
                              {SECONDARY_SEVENTH_IDS.map(
                                renderChordOverrideRow,
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {invGuardNotice && (
              <p className="text-xs text-[#E5A93C]" role="status">
                Keep at least one inversion active.
              </p>
            )}

            {/* Display and spoken format */}
            <div className="border-t border-[#2B323B] pt-3">
              <p className="mb-1.5 text-xs font-medium text-[#9CA3AE]">
                Display &amp; voice style
              </p>
              <div
                className="grid grid-cols-6 gap-1.5"
                role="group"
                aria-label="Inversion display and voice style"
              >
                {(
                  [
                    {
                      id: 'inversion-name',
                      label: 'Inversion',
                      span: 'col-span-2',
                    },
                    {
                      id: 'figured-bass',
                      label: 'Figured bass',
                      span: 'col-span-2',
                    },
                    {
                      id: 'bass-tone',
                      label: 'Bass tone',
                      span: 'col-span-2',
                    },
                    {
                      id: 'scale-degree',
                      label: 'Scale degree',
                      span: 'col-span-3',
                    },
                    {
                      id: 'solfege',
                      label: 'Solfège',
                      span: 'col-span-3',
                    },
                  ] as const
                ).map((mode) => {
                  const active = inversionNotation === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChangeInversionNotation(mode.id)}
                      className={`${mode.span} min-h-[38px] rounded-xl border px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4FB3A4] ${
                        active
                          ? 'border-[#4FB3A4] bg-[#4FB3A4]/20 text-[#4FB3A4]'
                          : 'border-[#343C47] bg-[#252B33] text-[#9CA3AE] hover:text-[#F3EFE6]'
                      }`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-[#9CA3AE]">
                Example: {exampleTriadDisplay.inline} ({exampleTriadSpoken}) ·{' '}
                {exampleSeventhDisplay.inline} ({exampleSeventhSpoken})
              </p>
            </div>

            {/* Musical voice-leading toggle */}
            <div className="border-t border-[#2B323B] pt-3">
              <SwitchRow
                id="toggle-musical-inversions"
                label="Musical voice-leading"
                description={
                  musicalInversionLeading
                    ? 'Favors smooth stepwise bass lines and idiomatic resolutions'
                    : "Picks randomly from each chord's enabled inversions"
                }
                checked={musicalInversionLeading}
                onChange={onToggleMusicalInversionLeading}
              />
            </div>
          </div>
        )}
      </div>

      {/* Progressive Melody over chords drawer */}
      <div className="mt-4 border-t border-[#2B323B] pt-3.5">
        <SwitchRow
          id="toggle-melody"
          label="Melody over chords"
          description={
            melodyEnabled
              ? melodyAllowTensions
                ? 'Chord tones, tensions, and stepwise passing tones'
                : 'Chord tones only'
              : 'Plays a counterpoint melody above the harmony during questions and replay'
          }
          checked={melodyEnabled}
          onChange={onToggleMelody}
        />

        {melodyEnabled && (
          <div className="mt-3 space-y-3 rounded-xl border border-[#2B323B] bg-[#16191D] p-3">
            <SwitchRow
              id="toggle-melody-tensions"
              label="Allow tensions"
              description={
                melodyAllowTensions
                  ? 'Adds chord-scale 9ths, 11ths, 13ths, and brief stepwise passing tones'
                  : 'Uses chord tones only (1, 3, 5, 7)'
              }
              checked={melodyAllowTensions}
              onChange={onToggleMelodyAllowTensions}
            />

            <div className="border-t border-[#2B323B] pt-2.5">
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="melody-volume-slider"
                  className="text-xs font-medium text-[#F3EFE6]"
                >
                  Melody volume
                </label>
                <span className="text-xs font-semibold text-[#4FB3A4] tabular-nums">
                  {Math.round(melodyVolume * 100)}%
                </span>
              </div>
              <input
                id="melody-volume-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={melodyVolume}
                onChange={(e) => onChangeMelodyVolume(Number(e.target.value))}
                className="studio-slider mt-1"
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2.5 border-t border-[#2B323B] pt-3.5">
        <SwitchRow
          id="toggle-triad-quality"
          label="Speak triad qualities"
          description={
            announceTriadQuality
              ? 'Says major, minor, and diminished (e.g. "One major, Two minor")'
              : 'Says numbers only for triads (e.g. "One, Two, Seven")'
          }
          checked={announceTriadQuality}
          onChange={onToggleTriadQuality}
        />

        <SwitchRow
          id="toggle-chords-behind-answer"
          label="Play chords behind answer voice"
          description="Carves a gentle midrange EQ pocket behind the narrator"
          checked={playChordsBehindAnswer}
          onChange={onToggleChordsBehindAnswer}
        />
      </div>
    </section>
  );
}
