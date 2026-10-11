import React, { useEffect, useState } from 'react';
import UpdateScreen from './UpdateScreen';
import { UpdateMode, dismissUpdateScreen, subscribeUpdate } from '../utils/appUpdate';

/** Affiche « Changement de bobine » dès qu'une nouvelle version est repérée, par-dessus tout. */
const UpdateGate: React.FC = () => {
  const [mode, setMode] = useState<UpdateMode | null>(null);
  useEffect(() => subscribeUpdate(setMode), []);
  if (!mode) return null;
  return (
    <UpdateScreen
      mode={mode}
      onLater={
        mode === 'error'
          ? undefined
          : () => {
              dismissUpdateScreen();
              setMode(null);
            }
      }
    />
  );
};

export default UpdateGate;
