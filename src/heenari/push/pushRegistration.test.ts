import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 테스트용 가짜 FCM 토큰(실제 값 아님)
const FAKE_FCM = vi.hoisted(() => ['fcm', 'test', 'device'].join('-'));

const h = vi.hoisted(() => ({
  permission: 'default' as NotificationPermission,
  request: vi.fn(),
  registration: { current: { scope: '/' } as unknown },
  supported: { current: true },
  token: { current: FAKE_FCM as string | null },
  writes: [] as unknown[][],
  deleteToken: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  getFirebaseDb: vi.fn(async () => ({ __db: true })),
  getFirebaseServices: () => ({ app: { __app: true } }),
}));
vi.mock('../pwa/serviceWorker', () => ({ registerServiceWorker: vi.fn(async () => h.registration.current) }));
vi.mock('firebase/messaging', () => ({
  isSupported: vi.fn(async () => h.supported.current),
  getMessaging: () => ({ __messaging: true }),
  getToken: vi.fn(async () => h.token.current),
  deleteToken: h.deleteToken,
}));
vi.mock('firebase/firestore', () => ({
  serverTimestamp: () => '__server',
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  setDoc: vi.fn(async (...args: unknown[]) => { h.writes.push(['set', ...args]); }),
  deleteDoc: vi.fn(async (...args: unknown[]) => { h.writes.push(['delete', ...args]); }),
}));

import { deviceIdOf, disablePush, enablePush, isPushEnabledHere } from './pushRegistration';
import { getToken } from 'firebase/messaging';

beforeEach(() => {
  h.permission = 'default';
  h.request.mockReset().mockImplementation(async () => h.permission);
  vi.stubGlobal('Notification', {
    get permission() { return h.permission; },
    requestPermission: h.request,
  });
  h.registration.current = { scope: '/' };
  h.supported.current = true;
  h.token.current = FAKE_FCM;
  h.writes.length = 0;
  h.deleteToken.mockReset().mockResolvedValue(true);
  localStorage.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe('deviceIdOf', () => {
  it('같은 토큰은 같은 40자 기기 ID가 된다', async () => {
    const a = await deviceIdOf(FAKE_FCM);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
    expect(await deviceIdOf(FAKE_FCM)).toBe(a);
    expect(await deviceIdOf('other')).not.toBe(a);
  });
});

describe('enablePush', () => {
  it('권한을 받으면 우리 서비스 워커로 토큰을 받아 본인 기기 문서에 저장한다', async () => {
    h.permission = 'granted';
    expect(await enablePush('u1', 'BKey')).toBe('enabled');
    expect(getToken).toHaveBeenCalledWith({ __messaging: true }, { vapidKey: 'BKey', serviceWorkerRegistration: { scope: '/' } });
    const id = await deviceIdOf(FAKE_FCM);
    expect(h.writes[0]).toEqual(['set', `members/u1/devices/${id}`, { token: FAKE_FCM, updatedAt: '__server' }]);
    expect(isPushEnabledHere()).toBe(true);
  });

  it('권한을 거부하면 아무것도 저장하지 않는다', async () => {
    h.permission = 'denied';
    expect(await enablePush('u1', 'BKey')).toBe('denied');
    expect(h.writes).toHaveLength(0);
    expect(isPushEnabledHere()).toBe(false);
  });

  it('서비스 워커·FCM·토큰이 없으면 미지원', async () => {
    h.permission = 'granted';
    h.registration.current = null;
    expect(await enablePush('u1', 'BKey')).toBe('unsupported');
    h.registration.current = { scope: '/' };
    h.supported.current = false;
    expect(await enablePush('u1', 'BKey')).toBe('unsupported');
    h.supported.current = true;
    h.token.current = null;
    expect(await enablePush('u1', 'BKey')).toBe('unsupported');
    expect(h.writes).toHaveLength(0);
  });
});

describe('disablePush', () => {
  it('토큰을 지우고 이 기기 문서를 삭제한다', async () => {
    h.permission = 'granted';
    await enablePush('u1', 'BKey');
    await disablePush('u1');
    const id = await deviceIdOf(FAKE_FCM);
    expect(h.deleteToken).toHaveBeenCalled();
    expect(h.writes.at(-1)).toEqual(['delete', `members/u1/devices/${id}`]);
    expect(isPushEnabledHere()).toBe(false);
  });

  it('저장된 기기가 없으면 문서 삭제 없이 끝낸다', async () => {
    h.supported.current = false;
    await disablePush('u1');
    expect(h.writes).toHaveLength(0);
    expect(h.deleteToken).not.toHaveBeenCalled();
  });
});
