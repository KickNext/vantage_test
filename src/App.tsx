import { useState, useEffect } from 'react';
import { Background3D } from './components/canvas/Background3D';
import { UIOverlay } from './components/layout/UIOverlay';
import { Leva } from 'leva';
import type { SceneType } from './types';
import './index.css';

function App() {
  const [scene, setScene] = useState<SceneType>('orbital');
  const [showConfig, setShowConfig] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const handleRestart = () => {
    setResetKey(prev => prev + 1);
  };

  // Toggle config with 'C' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c' && e.shiftKey) {
        setShowConfig(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <Leva hidden={!showConfig} theme={{
        colors: {
          accent1: '#4cc9f0',
          accent2: '#4cc9f0',
          accent3: '#4cc9f0',
          elevation1: '#0a0a0a',
          elevation2: '#111111',
          highlight1: '#ffffff',
          highlight2: '#aaaaaa',
        }
      }} />

      <Background3D key={resetKey} scene={scene} />

      <UIOverlay
        currentScene={scene}
        setScene={setScene}
        toggleConfig={() => setShowConfig(!showConfig)}
        onRestart={handleRestart}
      />
    </>
  );
}

export default App;
