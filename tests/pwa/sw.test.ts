import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// public/sw.js를 그대로 불러와 가짜 서비스 워커 전역에서 이벤트를 흘려 본다.
// (앱 안 브라우저 창은 서비스 워커 등록을 지원하지 않아 실제 등록 확인은 실기기에서 한다)

const ORIGIN = 'https://heenari-9f2a6.web.app';
const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

class FakeResponse {
  readonly body: string;
  readonly ok: boolean;
  constructor(body: string, ok = true) {
    this.body = body;
    this.ok = ok;
  }
  clone() { return new FakeResponse(this.body, this.ok); }
}

function setup() {
  const listeners = new Map<string, (event: unknown) => void>();
  const store = new Map<string, Map<string, FakeResponse>>();
  const keyOf = (request: unknown) => (typeof request === 'string' ? new URL(request, ORIGIN).href : (request as { url: string }).url);
  const caches = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const bucket = store.get(name)!;
      return {
        add: async (path: string) => { bucket.set(keyOf(path), new FakeResponse(`cached:${path}`)); },
        put: async (request: unknown, response: FakeResponse) => { bucket.set(keyOf(request), response); },
        match: async (request: unknown) => bucket.get(keyOf(request)),
      };
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
  const fetchMock = vi.fn(async (request: { url: string }) => new FakeResponse(`network:${new URL(request.url).pathname}`));
  const clients = {
    claim: vi.fn(async () => undefined),
    matchAll: vi.fn(async () => [] as unknown[]),
    openWindow: vi.fn(async () => undefined),
  };
  const registration = { showNotification: vi.fn(async () => undefined) };
  const self = {
    location: { origin: ORIGIN },
    registration,
    clients,
    skipWaiting: vi.fn(),
    addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler),
  };
  runInNewContext(source, { self, caches, fetch: fetchMock, URL, Promise, console });

  async function dispatch(type: string, extra: Record<string, unknown>) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<FakeResponse> | undefined;
    listeners.get(type)!({
      ...extra,
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      respondWith: (promise: Promise<FakeResponse>) => { responded = promise; },
    });
    await Promise.all(waits);
    return { responded: responded ? await responded : undefined, handled: responded !== undefined };
  }
  const request = (path: string, init: { mode?: string; method?: string; origin?: string } = {}) => ({
    url: new URL(path, init.origin ?? ORIGIN).href,
    method: init.method ?? 'GET',
    mode: init.mode ?? 'no-cors',
  });
  return { store, fetchMock, clients, registration, self, dispatch, request };
}

let sw: ReturnType<typeof setup>;
beforeEach(() => { sw = setup(); });

describe('sw.js 캐시', () => {
  it('설치 때 앱 셸을 캐시하고, 활성화 때 이전 버전 캐시를 지운다', async () => {
    sw.store.set('heenari-v1', new Map()); // 예전 버전 캐시
    await sw.dispatch('install', {});
    expect([...sw.store.get('heenari-v2')!.keys()]).toEqual([`${ORIGIN}/index.html`]);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
    await sw.dispatch('activate', {});
    expect([...sw.store.keys()]).toEqual(['heenari-v2']);
    expect(sw.clients.claim).toHaveBeenCalled();
  });

  it('화면 이동은 네트워크 우선이고, 오프라인이면 마지막 앱 셸을 보여준다', async () => {
    const online = await sw.dispatch('fetch', { request: sw.request('/schedule', { mode: 'navigate' }) });
    expect(online.responded?.body).toBe('network:/schedule');
    // 배포 직후에도 예전 페이지를 쓰지 않도록 브라우저 캐시를 거치지 않고 서버에 확인한다.
    expect(sw.fetchMock).toHaveBeenLastCalledWith(expect.objectContaining({ url: `${ORIGIN}/schedule` }), { cache: 'no-cache' });
    sw.fetchMock.mockRejectedValueOnce(new Error('offline'));
    const offline = await sw.dispatch('fetch', { request: sw.request('/me', { mode: 'navigate' }) });
    expect(offline.responded?.body).toBe('network:/schedule'); // 온라인일 때 저장한 셸
  });

  it('/assets/*는 캐시 우선이라 두 번째 요청은 네트워크를 타지 않는다', async () => {
    await sw.dispatch('fetch', { request: sw.request('/assets/index-abc.js') });
    await sw.dispatch('fetch', { request: sw.request('/assets/index-abc.js') });
    expect(sw.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('Firebase Auth 핸들러, 외부 도메인, GET이 아닌 요청은 가로채지 않는다', async () => {
    for (const request of [
      sw.request('/__/auth/handler?apiKey=x', { mode: 'navigate' }),
      sw.request('/v1/projects/x/databases/(default)/documents', { origin: 'https://firestore.googleapis.com' }),
      sw.request('/schedule', { mode: 'navigate', method: 'POST' }),
    ]) {
      expect((await sw.dispatch('fetch', { request })).handled).toBe(false);
    }
    expect(sw.fetchMock).not.toHaveBeenCalled();
  });
});

describe('sw.js 푸시', () => {
  it('FCM 데이터 메시지로 알림을 띄운다', async () => {
    const data = { json: () => ({ data: { title: '합주 초대', body: '김희나님이 초대했어요', url: '/schedule?day=2030-01-01', tag: 'invite-r1' } }) };
    await sw.dispatch('push', { data });
    expect(sw.registration.showNotification).toHaveBeenCalledWith('합주 초대', expect.objectContaining({
      body: '김희나님이 초대했어요',
      tag: 'invite-r1',
      icon: '/icons/icon-192.png',
      data: { url: '/schedule?day=2030-01-01' },
    }));
  });

  it('내용이 깨진 푸시도 기본 문구로 알린다', async () => {
    await sw.dispatch('push', { data: { json: () => { throw new Error('bad'); } } });
    expect(sw.registration.showNotification).toHaveBeenCalledWith('희나리', expect.objectContaining({ body: '', data: { url: '/schedule' } }));
  });

  it('알림을 누르면 열린 앱 창으로 이동하고, 없으면 새 창을 연다', async () => {
    const client = { url: `${ORIGIN}/`, navigate: vi.fn(), focus: vi.fn(async () => undefined) };
    sw.clients.matchAll.mockResolvedValueOnce([client]);
    const close = vi.fn();
    await sw.dispatch('notificationclick', { notification: { close, data: { url: '/schedule?day=2030-01-01' } } });
    expect(close).toHaveBeenCalled();
    expect(client.navigate).toHaveBeenCalledWith(`${ORIGIN}/schedule?day=2030-01-01`);
    expect(client.focus).toHaveBeenCalled();

    await sw.dispatch('notificationclick', { notification: { close, data: {} } });
    expect(sw.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/schedule`);
  });
});
