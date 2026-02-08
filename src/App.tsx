import { useCallback, useState } from 'react';
import { Background3D } from './components/canvas/Background3D';
import type { OrbitLayoutPreset } from './components/canvas/OrbitalWaves';
import { UIOverlay } from './components/layout/UIOverlay';
import './index.css';

const orbitLayoutSequence: OrbitLayoutPreset[] = [
  'cameraAware',
  'pairedFan',
  'waveArc',
  'orbitalCrown',
  'phaseLattice',
  'meridianWeave',
];

function App() {
  const [layoutPresetIndex, setLayoutPresetIndex] = useState(() =>
    Math.floor(Math.random() * orbitLayoutSequence.length),
  );
  const [resetKey, setResetKey] = useState(0);

  const handleRestart = useCallback(() => {
    setLayoutPresetIndex((prev) => (prev + 1) % orbitLayoutSequence.length);
    setResetKey(prev => prev + 1);
  }, []);

  return (
    <>
      <Background3D key={resetKey} layoutPreset={orbitLayoutSequence[layoutPresetIndex]} />

      <UIOverlay
        onRestart={handleRestart}
        presetNumber={layoutPresetIndex + 1}
        runId={resetKey}
      />
    </>
  );
}

export default App;
