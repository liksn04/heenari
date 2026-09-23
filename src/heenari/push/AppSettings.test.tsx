import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PushEnvironment } from './pushSupport';

const h = vi.hoisted(() => ({
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  enabledHere: { current: false },
  permission: 'default' as NotificationPermission,
}));

vi.mock('./pushRegistration', () => ({
  enablePush: h.enablePush,
  disablePush: h.disablePush,
  isPushEnabledHere: () => h.enabledHere.current,
}));

import { AppSettings } from './AppSettings';
import { listenForInstallPrompt } from '../pwa/installPrompt';

const android: PushEnvironment = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/152',
  hasNotification: true,
  hasServiceWorker: true,
  hasPushManager: true,
  standalone: false,
  vapidKey: 'BKey',
};
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1';

beforeEach(() => {
  h.enablePush.mockReset().mockResolvedValue('enabled');
  h.disablePush.mockReset().mockResolvedValue(undefined);
  h.enabledHere.current = false;
  h.permission = 'default';
  vi.stubGlobal('Notification', { get permission() { return h.permission; } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AppSettings 알림', () => {
  it('켜기에 성공하면 끄기 버튼과 안내를 보여준다', async () => {
    const user = userEvent.setup();
    render(<AppSettings uid="u1" env={android} />);
    await user.click(screen.getByRole('button', { name: '합주 알림 켜기' }));
    expect(h.enablePush).toHaveBeenCalledWith('u1', 'BKey');
    expect(await screen.findByRole('button', { name: '합주 알림 끄기' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('합주 1시간 전');
  });

  it('권한 거부·미지원·오류를 구분해 안내한다', async () => {
    const user = userEvent.setup();
    h.enablePush.mockResolvedValueOnce('denied').mockResolvedValueOnce('unsupported').mockRejectedValueOnce(new Error('x'));
    render(<AppSettings uid="u1" env={android} />);
    const button = () => screen.getByRole('button', { name: '합주 알림 켜기' });
    await user.click(button());
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('기기 설정에서'));
    await user.click(button());
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('받을 수 없어요'));
    await user.click(button());
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('켜지 못했어요'));
  });

  it('이미 켜진 기기는 끌 수 있고, 실패도 안내한다', async () => {
    h.enabledHere.current = true;
    h.disablePush.mockRejectedValueOnce(new Error('x'));
    const user = userEvent.setup();
    render(<AppSettings uid="u1" env={android} />);
    await user.click(screen.getByRole('button', { name: '합주 알림 끄기' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('끄지 못했어요'));
    await user.click(screen.getByRole('button', { name: '합주 알림 끄기' }));
    expect(await screen.findByRole('button', { name: '합주 알림 켜기' })).toBeTruthy();
    expect(h.disablePush).toHaveBeenCalledWith('u1');
  });

  it('권한을 막아 둔 기기는 설정 안내만 보여준다', () => {
    h.permission = 'denied';
    render(<AppSettings uid="u1" env={android} />);
    expect(screen.queryByRole('button', { name: '합주 알림 켜기' })).toBeNull();
    expect(screen.getByText(/알림 권한이 꺼져 있어요/)).toBeTruthy();
  });

  it('아이폰 사파리는 설치 방법과 설치 후 켜라는 안내를 보여준다', () => {
    render(<AppSettings uid="u1" env={{ ...android, userAgent: iphone }} />);
    expect(screen.getByText(/홈 화면에 추가/)).toBeTruthy();
    expect(screen.getByText(/홈 화면에 설치한 희나리 앱에서만/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '합주 알림 켜기' })).toBeNull();
  });

  it('설치된 앱에서는 설치 안내를 숨기고, 키가 없거나 미지원이면 알려준다', () => {
    const { rerender } = render(<AppSettings uid="u1" env={{ ...android, userAgent: iphone, standalone: true, vapidKey: undefined }} />);
    expect(screen.queryByText(/홈 화면에 추가/)).toBeNull();
    expect(screen.getByText('알림 설정이 아직 준비되지 않았어요.')).toBeTruthy();
    rerender(<AppSettings uid="u1" env={{ ...android, hasPushManager: false }} />);
    expect(screen.getByText('이 브라우저는 알림을 지원하지 않아요.')).toBeTruthy();
  });
});

describe('AppSettings 설치', () => {
  it('브라우저가 설치 제안을 주면 설치 버튼으로 띄운다', async () => {
    const target = new EventTarget();
    listenForInstallPrompt(target as unknown as Window);
    render(<AppSettings uid="u1" env={android} />);
    expect(screen.queryByRole('button', { name: /앱 설치/ })).toBeNull();

    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    act(() => { target.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /홈 화면에 앱 설치/ }));
    expect(prompt).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /앱 설치/ })).toBeNull();

    act(() => { target.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'dismissed' as const }) })); });
    expect(screen.getByRole('button', { name: /앱 설치/ })).toBeTruthy();
    act(() => { target.dispatchEvent(new Event('appinstalled')); });
    expect(screen.queryByRole('button', { name: /앱 설치/ })).toBeNull();
  });
});
