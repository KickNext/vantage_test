import { useCallback, useState } from 'react';
import { Background3D } from './components/canvas/Background3D';
import { UIOverlay } from './components/layout/UIOverlay';
import './index.css';

function App() {
  const [resetKey, setResetKey] = useState(0);

  const handleRestart = useCallback(() => {
    setResetKey(prev => prev + 1);
  }, []);

  return (
    <>
      <Background3D key={resetKey} />

      <UIOverlay onRestart={handleRestart} />
    </>
  );
}

export default App;
