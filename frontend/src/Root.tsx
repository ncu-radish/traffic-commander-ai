import { useState } from 'react';
import App from './App';
import UserView from './UserView';
import ModeSelect from './ModeSelect';
import { StudentProvider } from './state/StudentProvider';

type Mode = 'school' | 'parent' | null;

export default function Root() {
  const [mode, setMode] = useState<Mode>(null);

  /**
   * StudentProvider 必須包在 mode 判斷之外。
   * 校方端與家長端是互斥掛載的，切換角色會 unmount 整個子樹；
   * 狀態放在外層才能在切換後保留，兩端也才看得到同一份學生狀態、
   * 下車時間、時間軸事件與通知。
   */
  return (
    <StudentProvider>
      {mode === null ? (
        <ModeSelect onSelect={setMode} />
      ) : mode === 'parent' ? (
        <UserView onBack={() => setMode(null)} />
      ) : (
        <App onBack={() => setMode(null)} />
      )}
    </StudentProvider>
  );
}
