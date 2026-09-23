// 이 기기에서 합주 푸시를 켤 수 있는지 판단한다. 브라우저 API에 직접 기대지 않게 환경을 주입받는다.

export type PushSupport = 'supported' | 'unsupported' | 'ios-needs-install' | 'no-config';

export interface PushEnvironment {
  userAgent: string;
  hasNotification: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  standalone: boolean; // 홈 화면에 설치한 앱으로 실행 중인지
  vapidKey: string | undefined;
}

export function isIos(userAgent: string): boolean {
  return /iPhone|iPad|iPod/.test(userAgent);
}

export function detectPushSupport(env: PushEnvironment): PushSupport {
  if (!env.vapidKey) return 'no-config';
  // iOS는 홈 화면에 설치한 PWA에서만 웹 푸시를 받는다(iOS 16.4+).
  if (isIos(env.userAgent) && !env.standalone) return 'ios-needs-install';
  if (!env.hasNotification || !env.hasServiceWorker || !env.hasPushManager) return 'unsupported';
  return 'supported';
}

export function browserPushEnvironment(): PushEnvironment {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const win = typeof window === 'undefined' ? undefined : window;
  const standalone = Boolean(
    win?.matchMedia?.('(display-mode: standalone)').matches
    || (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone,
  );
  return {
    userAgent: nav?.userAgent ?? '',
    hasNotification: Boolean(win && 'Notification' in win),
    hasServiceWorker: Boolean(nav && 'serviceWorker' in nav),
    hasPushManager: Boolean(win && 'PushManager' in win),
    standalone,
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined,
  };
}
