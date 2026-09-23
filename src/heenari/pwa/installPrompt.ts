import { useSyncExternalStore } from 'react';

// 안드로이드 크롬 등에서 뜨는 설치 제안(beforeinstallprompt)을 붙잡아 두었다가 버튼으로 띄운다.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function listenForInstallPrompt(target: Pick<Window, 'addEventListener'> = window) {
  target.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  target.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  notify();
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === 'accepted';
}

export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => deferred !== null,
    () => false,
  );
}
