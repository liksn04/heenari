import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker, resetServiceWorkerForTest } from './serviceWorker';

afterEach(() => resetServiceWorkerForTest());

function fakeNavigator(register: ReturnType<typeof vi.fn>) {
  return { serviceWorker: { register } } as unknown as Pick<Navigator, 'serviceWorker'>;
}

describe('registerServiceWorker', () => {
  it('배포 빌드에서 /sw.js를 루트 범위로 한 번만 등록한다', async () => {
    const reg = { scope: '/' };
    const register = vi.fn().mockResolvedValue(reg);
    const env = { production: true, navigator: fakeNavigator(register) };
    expect(await registerServiceWorker(env)).toBe(reg);
    expect(await registerServiceWorker(env)).toBe(reg);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('개발 서버나 서비스 워커 미지원 환경에서는 등록하지 않는다', async () => {
    const register = vi.fn();
    expect(await registerServiceWorker({ production: false, navigator: fakeNavigator(register) })).toBeNull();
    resetServiceWorkerForTest();
    expect(await registerServiceWorker({ production: true, navigator: {} as Pick<Navigator, 'serviceWorker'> })).toBeNull();
    resetServiceWorkerForTest();
    expect(await registerServiceWorker({ production: true, navigator: undefined })).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it('등록 실패는 앱을 멈추지 않고 null을 돌려준다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const register = vi.fn().mockRejectedValue(new Error('blocked'));
    expect(await registerServiceWorker({ production: true, navigator: fakeNavigator(register) })).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
