// 희나리 서비스 워커: 설치형 PWA 셸 캐시와 합주 푸시 알림 표시.
// - Firebase Auth 핸들러(/__/), 외부 도메인(Firestore·Google 로그인), GET이 아닌 요청은 건드리지 않는다.
// - 화면 이동은 네트워크 우선, 실패하면 마지막으로 받은 index.html을 보여준다(오프라인 예약은 앱이 막는다).
// - 해시가 붙은 /assets/* 는 캐시 우선.
const CACHE = 'heenari-v1';
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function shouldHandle(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/__/')) return false;
  return true;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(SHELL, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(SHELL);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!shouldHandle(request)) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (new URL(request.url).pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  }
});

// FCM 데이터 메시지: { data: { title, body, url, tag } }
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const data = payload.data || payload;
  const title = data.title || '희나리';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/schedule' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/schedule', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
