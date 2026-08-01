import { useState } from 'react';
import App from './App';
import UserView from './UserView';
import ModeSelect from './ModeSelect';

type Mode = 'school' | 'parent' | null;

export default function Root() {
  const [mode, setMode] = useState<Mode>(null);

  if (mode === null) {
    return <ModeSelect onSelect={setMode} />;
  }
  if (mode === 'parent') {
    return <UserView onBack={() => setMode(null)} />;
  }
  return <App />;
}
