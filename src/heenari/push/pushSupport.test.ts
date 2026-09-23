import { describe, expect, it } from 'vitest';
import { detectPushSupport, isIos, type PushEnvironment } from './pushSupport';

const android: PushEnvironment = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/152',
  hasNotification: true,
  hasServiceWorker: true,
  hasPushManager: true,
  standalone: false,
  vapidKey: 'BPublicKey',
};
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';

describe('detectPushSupport', () => {
  it('안드로이드 크롬은 설치 없이도 켤 수 있다', () => {
    expect(detectPushSupport(android)).toBe('supported');
  });

  it('아이폰은 홈 화면에 설치한 앱에서만 켤 수 있다', () => {
    expect(detectPushSupport({ ...android, userAgent: iphone })).toBe('ios-needs-install');
    expect(detectPushSupport({ ...android, userAgent: iphone, standalone: true })).toBe('supported');
  });

  it('필요한 브라우저 기능이 없으면 미지원', () => {
    expect(detectPushSupport({ ...android, hasPushManager: false })).toBe('unsupported');
    expect(detectPushSupport({ ...android, hasNotification: false })).toBe('unsupported');
    expect(detectPushSupport({ ...android, hasServiceWorker: false })).toBe('unsupported');
  });

  it('웹 푸시 키가 설정되지 않으면 준비 전', () => {
    expect(detectPushSupport({ ...android, vapidKey: undefined })).toBe('no-config');
  });

  it('isIos는 아이폰·아이패드를 알아본다', () => {
    expect(isIos(iphone)).toBe(true);
    expect(isIos('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe(true);
    expect(isIos(android.userAgent)).toBe(false);
  });
});
