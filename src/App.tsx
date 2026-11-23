import { AdvancedSettings } from './components/AdvancedSettings';
import { ChordSelector } from './components/ChordSelector';
import { CoreControls } from './components/CoreControls';
import { PocketStage } from './components/PocketStage';
import { SoundAndMix } from './components/SoundAndMix';
import { TransportBar } from './components/TransportBar';
import { useEarTrainer } from './hooks/useEarTrainer';

export function App() {
  const {
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
    refreshOutputProfile,
  } = useEarTrainer();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[460px] px-4 pb-12 pt-4">
      <PocketStage snapshot={snapshot} settings={settings} />

      <TransportBar
        isRunning={snapshot.isRunning}
        phase={snapshot.phase}
        hasProgression={snapshot.progression.length > 0}
        onStart={start}
        onStop={stop}
        onReplay={replayQuestion}
        onSkip={skipToAnswer}
      />

      <ChordSelector
        allowedChords={settings.allowedChords}
        secondaryDominantsEnabled={settings.secondaryDominantsEnabled}
        allowedSecondaryDominants={settings.allowedSecondaryDominants}
        strictSecondaryResolution={settings.strictSecondaryResolution}
        triadInversions={settings.triadInversions}
        seventhInversions={settings.seventhInversions}
        chordInversionOverrides={settings.chordInversionOverrides}
        inversionNotation={settings.inversionNotation}
        musicalInversionLeading={settings.musicalInversionLeading}
        melodyEnabled={settings.melodyEnabled}
        melodyAllowTensions={settings.melodyAllowTensions}
        melodyVolume={settings.melodyVolume}
        announceTriadQuality={settings.announceTriadQuality}
        playChordsBehindAnswer={settings.playChordsBehindAnswer}
        onChange={(allowedChords) => updateSettings({ allowedChords })}
        onToggleSecondaryDominants={(secondaryDominantsEnabled) =>
          updateSettings({ secondaryDominantsEnabled })
        }
        onChangeSecondaryDominants={(allowedSecondaryDominants) =>
          updateSettings({ allowedSecondaryDominants })
        }
        onToggleStrictSecondaryResolution={(strictSecondaryResolution) =>
          updateSettings({ strictSecondaryResolution })
        }
        onChangeTriadInversions={(triadInversions) =>
          updateSettings({ triadInversions })
        }
        onChangeSeventhInversions={(seventhInversions) =>
          updateSettings({ seventhInversions })
        }
        onChangeChordInversionOverrides={(chordInversionOverrides) =>
          updateSettings({ chordInversionOverrides })
        }
        onChangeInversionNotation={(inversionNotation) =>
          updateSettings({ inversionNotation })
        }
        onToggleMusicalInversionLeading={(musicalInversionLeading) =>
          updateSettings({ musicalInversionLeading })
        }
        onToggleMelody={(melodyEnabled) => updateSettings({ melodyEnabled })}
        onToggleMelodyAllowTensions={(melodyAllowTensions) =>
          updateSettings({ melodyAllowTensions })
        }
        onChangeMelodyVolume={(melodyVolume) => updateSettings({ melodyVolume })}
        onToggleTriadQuality={(announceTriadQuality) =>
          updateSettings({ announceTriadQuality })
        }
        onToggleChordsBehindAnswer={(playChordsBehindAnswer) =>
          updateSettings({ playChordsBehindAnswer })
        }
      />

      <CoreControls settings={settings} onUpdate={updateSettings} />

      <SoundAndMix
        settings={settings}
        activeKey={snapshot.activeKey}
        isRunning={snapshot.isRunning}
        onUpdate={updateSettings}
        onPreviewSound={previewSound}
        onPreviewMelodySound={previewMelodySound}
      />

      <AdvancedSettings
        settings={settings}
        resolvedOutputInfo={snapshot.resolvedOutputInfo}
        voices={voices}
        onUpdate={updateSettings}
        onPreviewOutputProfile={(profile) =>
          previewSound(undefined, undefined, undefined, undefined, profile)
        }
        onRefreshOutputProfile={refreshOutputProfile}
      />
    </main>
  );
}

export default App;
