import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { SETTINGS_STORAGE_KEY } from '../../types/settings';

describe('Paws Off App UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders primary controls (Key, Sound, Space, Mix, Drone switch) outside collapsed Advanced Settings', () => {
    const { container } = render(<App />);

    expect(screen.getByText('Paws Off')).toBeInTheDocument();
    expect(container.textContent).not.toContain('—');
    expect(screen.getByText('Auto key')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /start pocket mode/i }),
    ).toBeInTheDocument();

    // Advanced settings collapsed by default (only Timing & speech remains inside)
    const advButton = screen.getByRole('button', {
      name: /advanced settings/i,
    });
    expect(advButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/pause between repeats/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/speech rate/i)).not.toBeInTheDocument();

    // Core defaults visible on primary screen (120 BPM, 4 beats = 2.0s per chord)
    expect(screen.getByText('120 BPM')).toBeInTheDocument();
    expect(screen.getByText('2.0s per chord')).toBeInTheDocument();

    // Progression length supports 2..8 with 4 selected by default
    const lengthGroup = screen.getByRole('group', { name: /progression length/i });
    const lengthButtons = within(lengthGroup).getAllByRole('button');
    expect(lengthButtons.map((b) => b.textContent)).toEqual([
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
    expect(lengthButtons[2]).toHaveAttribute('aria-pressed', 'true');

    // Session & answer loop switches + Key orientation promoted out of Advanced Settings
    expect(
      screen.getByRole('switch', { name: /play chords behind answer voice/i }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('switch', {
        name: /play progression one final time after answer/i,
      }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('group', { name: /key orientation/i }),
    ).toBeInTheDocument();

    // Key mode visible in primary controls: Auto-rotate on the left (default), Fixed key on right
    const keyModeGroup = screen.getByRole('group', { name: /key mode/i });
    const keyModeButtons = within(keyModeGroup).getAllByRole('button');
    expect(keyModeButtons.map((b) => b.textContent)).toEqual([
      'Auto-rotate',
      'Fixed key',
    ]);
    expect(keyModeButtons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(keyModeButtons[1]).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText(/rotate key every/i)).toBeInTheDocument();

    // Sound, Space, Chords volume, Voice volume, and Drone switch visible outside Advanced
    const soundGroup = screen.getByRole('group', { name: /synth sound/i });
    const soundButtons = within(soundGroup).getAllByRole('button');
    expect(soundButtons[0].textContent).toMatch(/velvet pad/i);
    expect(soundButtons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: /felt piano/i }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: /warm rhodes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /soft vibes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /grand piano.*salamander acoustic/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /warm strings.*bowed ensemble/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /chamber cello.*rich bowed cello/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /french horn.*warm brass choir/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /concert harp.*plucked acoustic/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /nylon guitar.*classical acoustic/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /clean guitar.*warm jazz electric/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /harmonium.*meditative reed organ/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /pipe organ.*warm cathedral/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /satb choir.*ooh & ahh voices/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /wurlitzer ep.*warm vintage reed/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /juno poly.*analog stereo synth/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /jazz organ.*warm b3 drawbars/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /glass celesta.*crystalline & bell-like/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /electric piano/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /soft pad/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /warm room/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.queryByRole('group', { name: /audio output profile/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: /^stereo$/i }),
    ).toHaveAttribute('aria-checked', 'true');
    const stereoGroup = screen.getByRole('group', {
      name: /stereo voice placement/i,
    });
    const stereoButtons = within(stereoGroup).getAllByRole('button');
    expect(stereoButtons.map((b) => b.textContent)).toEqual([
      'SATB choir',
      'Left to right',
      'Random',
    ]);
    expect(stereoButtons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/chords volume/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/voice volume/i)).toBeInTheDocument();

    // Progressive Drone: switch visible, sub-controls hidden while OFF
    expect(
      screen.getByRole('switch', { name: /^enable drone$/i }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByLabelText(/drone volume/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /drone scale tone/i })).not.toBeInTheDocument();

    // Basic triads pressed & triad quality toggle defaults to OFF inside Allowed chords
    expect(
      screen.getByRole('button', { name: /triad I \(one major\)/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: /triad ii \(two minor\)/i }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: /seventh Imaj7/i }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('switch', { name: /speak triad qualities/i }),
    ).toHaveAttribute('aria-checked', 'false');

    // Secondary dominants toggle defaults OFF with chord buttons hidden
    expect(
      screen.getByRole('switch', { name: /secondary dominants/i }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.queryByRole('button', { name: /secondary dominant triad V\/ii \(/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /secondary dominant seventh V7\/IV/i }),
    ).not.toBeInTheDocument();

    // Awake/Pocket lock badge removed from stage header
    expect(screen.queryByText(/^awake$/i)).not.toBeInTheDocument();
  });

  it('toggles chords, applies quick-select presets, and prevents deselecting the final chord', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole('button', { name: 'Essential' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /basic/i }),
    ).not.toBeInTheDocument();

    // Select All Sevenths preset
    await user.click(screen.getByRole('button', { name: 'All Sevenths' }));
    expect(screen.getByText('7 active')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /seventh viiø7/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Clicking Essential restores the 4 essential triads (I, IV, V, vi)
    await user.click(screen.getByRole('button', { name: 'Essential' }));
    expect(screen.getByText('4 active')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /triad I \(one major\)/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Select All Sevenths preset again to test single-chord deselection
    await user.click(screen.getByRole('button', { name: 'All Sevenths' }));
    expect(screen.getByText('7 active')).toBeInTheDocument();

    // Toggle one chord off and check count drops to 6
    await user.click(screen.getByRole('button', { name: /seventh ii7/i }));
    expect(screen.getByText('6 active')).toBeInTheDocument();

    // Keep removing until only 1 chord remains
    for (const label of [
      /seventh Imaj7/i,
      /seventh iii7/i,
      /seventh IVmaj7/i,
      /seventh V7/i,
      /seventh vi7/i,
    ]) {
      await user.click(screen.getByRole('button', { name: label }));
    }
    expect(screen.getByText('1 active')).toBeInTheDocument();

    // Attempting to deselect the final chord keeps it active & shows warning
    await user.click(screen.getByRole('button', { name: /seventh viiø7/i }));
    expect(screen.getByText('1 active')).toBeInTheDocument();
    expect(
      screen.getByText(/keep at least one chord active/i),
    ).toBeInTheDocument();
  });

  it('updates primary Sound, Key, Drone, and Advanced Settings and persists to localStorage', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Toggle Speak triad qualities & Play chords behind answer right inside Allowed chords
    await user.click(
      screen.getByRole('switch', { name: /speak triad qualities/i }),
    );
    expect(
      screen.getByRole('switch', { name: /speak triad qualities/i }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/one major, two minor/i)).toBeInTheDocument();

    // Select progression length 8 and verify 8 stage slots render cleanly
    const lengthGroup = screen.getByRole('group', { name: /progression length/i });
    await user.click(within(lengthGroup).getByRole('button', { name: '8' }));
    expect(screen.getByTestId('stage-slot-7')).toBeInTheDocument();

    // Toggle Play progression one final time after answer OFF right under Question repeats
    await user.click(
      screen.getByRole('switch', {
        name: /play progression one final time after answer/i,
      }),
    );

    // Switch Key mode to Fixed key right on primary screen and pick G Major
    await user.click(screen.getByRole('button', { name: /fixed key/i }));
    await user.click(screen.getByRole('button', { name: 'G Major' }));
    expect(screen.getByText('G Major')).toBeInTheDocument();

    // Switch back to Auto-rotate
    await user.click(screen.getByRole('button', { name: /auto-rotate/i }));

    // Primary Sound & Mix interactions (no need to expand Advanced!)
    await user.click(screen.getByRole('button', { name: /warm rhodes/i }));
    await user.click(screen.getByRole('button', { name: /lush hall/i }));
    await user.click(screen.getByRole('button', { name: /^random$/i }));
    await user.click(screen.getByRole('switch', { name: /^enable drone$/i }));

    // Drone sub-controls now expanded right in place
    expect(screen.getByLabelText(/drone volume/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Scale tone 5' }));
    await user.click(screen.getByRole('button', { name: 'High (+2)' }));

    // Expand Advanced Settings (Timing, speech, and Audio output override)
    await user.click(
      screen.getByRole('button', { name: /advanced settings/i }),
    );
    expect(screen.getByLabelText(/pause between repeats/i)).toBeInTheDocument();
    expect(screen.getByText(/Seven half diminished/i)).toBeInTheDocument();
    const outputGroup = screen.getByRole('group', {
      name: /audio output profile/i,
    });
    const outputButtons = within(outputGroup).getAllByRole('button');
    expect(outputButtons.map((b) => b.textContent)).toEqual([
      'Auto',
      'Phone Speaker',
      'Headphones',
    ]);
    expect(outputButtons[0]).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(outputGroup).getByRole('button', { name: 'Headphones' }));

    // Switch to Minor 7b5 naming & Browser TTS
    await user.click(screen.getByRole('button', { name: 'Minor 7♭5' }));
    expect(
      screen.getByText(/Seven minor seven flat five/i),
    ).toBeInTheDocument();

    // Enable Secondary dominants, select All 9, toggle V/ii off, and toggle Strict resolution off
    await user.click(
      screen.getByRole('switch', { name: /secondary dominants/i }),
    );
    expect(
      screen.getByRole('switch', { name: /strict resolution/i }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('button', { name: /secondary dominant triad V\/ii \(/i }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: /secondary dominant seventh V7\/IV \(/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'All 9' }));
    expect(
      screen.getByRole('button', { name: /secondary dominant triad V\/ii \(/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(
      screen.getByRole('button', { name: /secondary dominant triad V\/ii \(/i }),
    );
    expect(
      screen.getByRole('button', { name: /secondary dominant triad V\/ii \(/i }),
    ).toHaveAttribute('aria-pressed', 'false');
    await user.click(
      screen.getByRole('switch', { name: /strict resolution/i }),
    );
    expect(
      screen.getByRole('switch', { name: /strict resolution/i }),
    ).toHaveAttribute('aria-checked', 'false');

    // Expand Inversions (Root only by default), update globals + per-chord override + style, and persist
    expect(screen.getByText('Root only')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /inversions/i }));
    const triadInvGroup = screen.getByRole('group', {
      name: /triad inversions default/i,
    });
    await user.click(within(triadInvGroup).getByRole('button', { name: '1st' }));
    const seventhInvGroup = screen.getByRole('group', {
      name: /seventh inversions default/i,
    });
    await user.click(
      within(seventhInvGroup).getByRole('button', { name: '3rd' }),
    );
    await user.click(
      screen.getByRole('button', { name: /customize per chord/i }),
    );
    const perChordMatrix = document.getElementById('inversions-per-chord-matrix')!;
    await user.click(
      within(perChordMatrix).getByRole('button', { name: /^triads/i }),
    );
    await user.click(
      screen.getByRole('button', { name: 'I second inversion' }),
    );
    expect(screen.getByText('1 override')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Figured bass' }),
    );
    await user.click(
      screen.getByRole('switch', { name: /musical voice-leading/i }),
    );

    expect(
      screen.getByRole('button', { name: /built-in \(pocket\)/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText(/^voice$/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /browser tts/i }));
    expect(screen.getByLabelText(/^voice$/i)).toBeInTheDocument();

    const saved = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}',
    );
    expect(saved.announceTriadQuality).toBe(true);
    expect(saved.playChordsBehindAnswer).toBe(true);
    expect(saved.playFinalReplayAfterAnswer).toBe(false);
    expect(saved.progressionLength).toBe(8);
    expect(saved.halfDimNaming).toBe('minor-seven-flat-five');
    expect(saved.timbre).toBe('warm-rhodes');
    expect(saved.ambience).toBe('lush-hall');
    expect(saved.outputProfile).toBe('headphones');
    expect(saved.voicePanning).toBe(true);
    expect(saved.voicePanningMode).toBe('random');
    expect(saved.droneEnabled).toBe(true);
    expect(saved.droneScaleDegree).toBe(5);
    expect(saved.droneOctave).toBe(2);
    expect(saved.keyMode).toBe('auto-rotate');
    expect(saved.fixedKey).toBe(7);
    expect(saved.chordVolume).toBe(0.8);
    expect(saved.voiceVolume).toBe(0.8);
    expect(saved.droneVolume).toBe(0.5);
    expect(saved.voiceSource).toBe('speech-synthesis');
    expect(saved.secondaryDominantsEnabled).toBe(true);
    expect(saved.strictSecondaryResolution).toBe(false);
    expect(saved.allowedSecondaryDominants).toHaveLength(8);
    expect(saved.allowedSecondaryDominants).not.toContain('V/ii');
    expect(saved.triadInversions).toEqual([0, 1]);
    expect(saved.seventhInversions).toEqual([0, 3]);
    expect(saved.chordInversionOverrides).toEqual({ I: [0, 1, 2] });
    expect(saved.inversionNotation).toBe('figured-bass');
    expect(saved.musicalInversionLeading).toBe(false);
  });

  it('provides progressive-disclosure per-chord inversion drawers for sevenths and secondary dominants even when unchecked', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Open Level 0 (Inversions) and Level 1 (Customize per chord) while 7ths and secondary dominants remain disabled
    await user.click(screen.getByRole('button', { name: /inversions/i }));
    await user.click(
      screen.getByRole('button', { name: /customize per chord/i }),
    );

    const perChordMatrix = document.getElementById('inversions-per-chord-matrix')!;
    const triadsDrawer = within(perChordMatrix).getByRole('button', {
      name: /^triads/i,
    });
    const seventhsDrawer = within(perChordMatrix).getByRole('button', {
      name: /^seventh chords/i,
    });
    const secondaryDrawer = within(perChordMatrix).getByRole('button', {
      name: /^secondary dominants/i,
    });

    expect(triadsDrawer).toHaveAttribute('aria-expanded', 'false');
    expect(seventhsDrawer).toHaveAttribute('aria-expanded', 'false');
    expect(secondaryDrawer).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', { name: 'I second inversion' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'V7 third inversion' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'V/V first inversion' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'V7/IV third inversion' }),
    ).not.toBeInTheDocument();

    // Expand Level 2b: Seventh chords (even though none are active above)
    await user.click(seventhsDrawer);
    expect(seventhsDrawer).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText(/select seventh chords above to include them in progressions/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'V7 third inversion' }),
    );
    expect(screen.getByText('1 override')).toBeInTheDocument();
    expect(within(perChordMatrix).getByText('1 custom')).toBeInTheDocument();

    // Expand Level 2c: Secondary dominants container; Level 3 sub-drawers start collapsed
    await user.click(secondaryDrawer);
    expect(secondaryDrawer).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText(
        /turn on secondary dominants above to include these chords in progressions/i,
      ),
    ).toBeInTheDocument();
    const secContainer = document.getElementById('inversions-group-secondary')!;
    const secTriadsDrawer = within(secContainer).getByRole('button', {
      name: /^triads\s+V\/x/i,
    });
    const secSeventhsDrawer = within(secContainer).getByRole('button', {
      name: /^dominant 7ths\s+V7\/x/i,
    });
    expect(secTriadsDrawer).toHaveAttribute('aria-expanded', 'false');
    expect(secSeventhsDrawer).toHaveAttribute('aria-expanded', 'false');

    // Expand Level 3a (Triads V/x) and Level 3b (Dominant 7ths V7/x) and set overrides
    await user.click(secTriadsDrawer);
    expect(secTriadsDrawer).toHaveAttribute('aria-expanded', 'true');
    await user.click(
      screen.getByRole('button', { name: 'V/V first inversion' }),
    );

    await user.click(secSeventhsDrawer);
    expect(secSeventhsDrawer).toHaveAttribute('aria-expanded', 'true');
    await user.click(
      screen.getByRole('button', { name: 'V7/IV third inversion' }),
    );

    expect(screen.getByText('3 overrides')).toBeInTheDocument();
    const saved = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}',
    );
    expect(saved.chordInversionOverrides).toEqual({
      V7: [0, 3],
      'V/V': [0, 1],
      'V7/IV': [0, 3],
    });

    // Reset secondary triad overrides via sibling button; V7 and V7/IV remain
    await user.click(
      screen.getByRole('button', { name: 'Reset secondary triad overrides' }),
    );
    expect(screen.getByText('2 overrides')).toBeInTheDocument();
    const afterSecTriadReset = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}',
    );
    expect(afterSecTriadReset.chordInversionOverrides).toEqual({
      V7: [0, 3],
      'V7/IV': [0, 3],
    });

    // Reset all overrides globally
    await user.click(screen.getByRole('button', { name: 'Reset all' }));
    expect(screen.getByText('Using defaults')).toBeInTheDocument();
    const afterResetAll = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}',
    );
    expect(afterResetAll.chordInversionOverrides).toEqual({});
  });

  it('supports Scale degree and Solfege inversion display and voice styles with live preview and persistence', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /inversions/i }));
    await user.click(screen.getByRole('button', { name: 'Scale degree' }));
    expect(
      screen.getByRole('button', { name: 'Scale degree' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(
        /Example: I \(over 3\) \(One over degree three\) · V7 \(over 4\) \(Five seven over degree four\)/i,
      ),
    ).toBeInTheDocument();

    const afterScaleDegree = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}',
    );
    expect(afterScaleDegree.inversionNotation).toBe('scale-degree');

    await user.click(screen.getByRole('button', { name: 'Solfège' }));
    expect(screen.getByRole('button', { name: 'Solfège' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByText(
        /Example: I \(over Mi\) \(One over mi\) · V7 \(over Fa\) \(Five seven over fa\)/i,
      ),
    ).toBeInTheDocument();

    const afterSolfege = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}',
    );
    expect(afterSolfege.inversionNotation).toBe('solfege');
  });

  it('supports Melody over chords, Allow tensions, Melody volume, and auto-paired Melody sound with manual override', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Defaults OFF with sub-controls hidden
    const melodyToggle = screen.getByRole('switch', {
      name: /melody over chords/i,
    });
    expect(melodyToggle).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.queryByRole('switch', { name: /allow tensions/i }),
    ).not.toBeInTheDocument();

    // Switching chord sound to Warm Rhodes auto-selects Clean Guitar as paired melody sound
    const chordSoundGroup = screen.getByRole('group', { name: /synth sound/i });
    await user.click(
      within(chordSoundGroup).getByRole('button', { name: /warm rhodes/i }),
    );

    await user.click(melodyToggle);
    expect(melodyToggle).toHaveAttribute('aria-checked', 'true');
    const tensionsToggle = screen.getByRole('switch', {
      name: /allow tensions/i,
    });
    expect(tensionsToggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByLabelText(/melody volume/i)).toBeInTheDocument();

    // Melody sound drawer shows auto-paired Clean Guitar and allows manual override
    const melodySoundBtn = screen.getByRole('button', { name: /melody sound/i });
    expect(melodySoundBtn).toHaveAttribute('aria-expanded', 'false');
    expect(within(melodySoundBtn).getByText('Clean Guitar')).toBeInTheDocument();

    await user.click(melodySoundBtn);
    expect(melodySoundBtn).toHaveAttribute('aria-expanded', 'true');

    const melodyGrid = document.getElementById('melody-sound-grid')!;
    await user.click(
      within(melodyGrid).getByRole('button', { name: /concert harp/i }),
    );
    expect(within(melodySoundBtn).getByText('Concert Harp')).toBeInTheDocument();

    await user.click(tensionsToggle);
    expect(tensionsToggle).toHaveAttribute('aria-checked', 'true');

    const saved = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}',
    );
    expect(saved.melodyEnabled).toBe(true);
    expect(saved.melodyAllowTensions).toBe(true);
    expect(saved.melodyVolume).toBe(0.75);
    expect(saved.timbre).toBe('warm-rhodes');
    expect(saved.melodyTimbre).toBe('concert-harp');

    // Switching chord sound afterwards auto-pairs again cleanly (Soft Vibes -> Warm Rhodes)
    await user.click(
      within(chordSoundGroup).getByRole('button', { name: /soft vibes/i }),
    );
    expect(within(melodySoundBtn).getByText('Warm Rhodes')).toBeInTheDocument();
  });
});
