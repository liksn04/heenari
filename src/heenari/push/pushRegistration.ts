import { getFirebaseDb, getFirebaseServices } from '../lib/firebase';
import { registerServiceWorker } from '../pwa/serviceWorker';

// 합주 알림 켜기/끄기: 권한 요청 → FCM 토큰 → members/{uid}/devices/{deviceId} 저장.
// 기기 ID는 토큰 해시라 같은 기기에서 다시 켜도 문서가 늘지 않는다.

export type EnableResult = 'enabled' | 'denied' | 'unsupported';

const DEVICE_KEY = 'heenari.pushDeviceId';

export async function deviceIdOf(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

function readStoredDevice(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}

function storeDevice(deviceId: string | null) {
  try {
    if (deviceId) localStorage.setItem(DEVICE_KEY, deviceId);
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 알림 자체는 동작한다.
  }
}

// 권한이 허용돼 있고 이 기기 토큰을 저장한 적이 있으면 켜진 상태로 본다.
export function isPushEnabledHere(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted' && readStoredDevice() !== null;
}

export async function enablePush(uid: string, vapidKey: string): Promise<EnableResult> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await registerServiceWorker();
  if (!registration) return 'unsupported';

  const messagingModule = await import('firebase/messaging');
  if (!(await messagingModule.isSupported())) return 'unsupported';
  const messaging = messagingModule.getMessaging(getFirebaseServices().app);
  const token = await messagingModule.getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) return 'unsupported';

  const deviceId = await deviceIdOf(token);
  const [fs, db] = await Promise.all([import('firebase/firestore'), getFirebaseDb()]);
  await fs.setDoc(fs.doc(db, 'members', uid, 'devices', deviceId), { token, updatedAt: fs.serverTimestamp() });
  storeDevice(deviceId);
  return 'enabled';
}

export async function disablePush(uid: string): Promise<void> {
  const deviceId = readStoredDevice();
  const messagingModule = await import('firebase/messaging');
  if (await messagingModule.isSupported()) {
    await messagingModule.deleteToken(messagingModule.getMessaging(getFirebaseServices().app)).catch(() => false);
  }
  if (deviceId) {
    const [fs, db] = await Promise.all([import('firebase/firestore'), getFirebaseDb()]);
    await fs.deleteDoc(fs.doc(db, 'members', uid, 'devices', deviceId));
  }
  storeDevice(null);
}
