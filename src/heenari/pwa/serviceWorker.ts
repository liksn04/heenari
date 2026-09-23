// 설치형 PWA와 푸시 알림에 쓰는 서비스 워커 등록. 개발 서버에서는 캐시가 방해되지 않게 등록하지 않는다.

export interface ServiceWorkerEnv {
  production: boolean;
  navigator: Pick<Navigator, 'serviceWorker'> | undefined;
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

function defaultEnv(): ServiceWorkerEnv {
  return {
    production: import.meta.env.PROD,
    navigator: typeof navigator === 'undefined' ? undefined : navigator,
  };
}

export function registerServiceWorker(env: ServiceWorkerEnv = defaultEnv()): Promise<ServiceWorkerRegistration | null> {
  if (registration) return registration;
  if (!env.production || !env.navigator || !('serviceWorker' in env.navigator)) {
    registration = Promise.resolve(null);
    return registration;
  }
  registration = env.navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .catch((error: unknown) => {
      console.warn('서비스 워커를 등록하지 못했습니다.', error);
      return null;
    });
  return registration;
}

// 테스트 전용: 등록 상태 초기화
export function resetServiceWorkerForTest() {
  registration = null;
}
