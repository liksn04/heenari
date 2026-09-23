import { useState } from 'react';
import { Bell, BellOff, Download, Share } from 'lucide-react';
import { promptInstall, useCanInstall } from '../pwa/installPrompt';
import { browserPushEnvironment, detectPushSupport, isIos, type PushEnvironment } from './pushSupport';
import { disablePush, enablePush, isPushEnabledHere } from './pushRegistration';

interface Message {
  tone: 'success' | 'error';
  text: string;
}

function permissionDenied(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'denied';
}

// 내 정보 화면: 앱 설치와 합주 알림 켜기.
export function AppSettings({ uid, env = browserPushEnvironment() }: { uid: string; env?: PushEnvironment }) {
  const support = detectPushSupport(env);
  const canInstall = useCanInstall();
  const [enabled, setEnabled] = useState(() => isPushEnabledHere());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await enablePush(uid, env.vapidKey ?? '');
      if (result === 'enabled') {
        setEnabled(true);
        setMessage({ tone: 'success', text: '합주 초대와 합주 1시간 전 알림을 이 기기로 보내드려요.' });
      } else if (result === 'denied') {
        setMessage({ tone: 'error', text: '알림 권한이 꺼져 있어요. 기기 설정에서 희나리 알림을 허용해주세요.' });
      } else {
        setMessage({ tone: 'error', text: '이 브라우저에서는 알림을 받을 수 없어요.' });
      }
    } catch {
      setMessage({ tone: 'error', text: '알림을 켜지 못했어요. 잠시 후 다시 시도해주세요.' });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      await disablePush(uid);
      setEnabled(false);
      setMessage({ tone: 'success', text: '이 기기의 합주 알림을 껐어요.' });
    } catch {
      setMessage({ tone: 'error', text: '알림을 끄지 못했어요. 잠시 후 다시 시도해주세요.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-settings">
      {!env.standalone && (canInstall ? (
        <button type="button" className="secondary-button" onClick={() => void promptInstall()}>
          <Download size={18} aria-hidden="true" /> 홈 화면에 앱 설치
        </button>
      ) : isIos(env.userAgent) ? (
        <p className="settings-note">
          <Share size={15} aria-hidden="true" /> 사파리 아래쪽 공유 버튼 → <strong>홈 화면에 추가</strong>를 누르면 앱으로 설치돼요.
        </p>
      ) : null)}

      {support === 'supported' ? (
        permissionDenied() && !enabled ? (
          <p className="settings-note">알림 권한이 꺼져 있어요. 브라우저나 기기 설정에서 희나리 알림을 허용해주세요.</p>
        ) : enabled ? (
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void turnOff()}>
            <BellOff size={18} aria-hidden="true" /> {busy ? '끄고 있어요' : '합주 알림 끄기'}
          </button>
        ) : (
          <button type="button" className="primary-button" disabled={busy} onClick={() => void turnOn()}>
            <Bell size={18} aria-hidden="true" /> {busy ? '켜고 있어요' : '합주 알림 켜기'}
          </button>
        )
      ) : support === 'ios-needs-install' ? (
        <p className="settings-note">아이폰은 홈 화면에 설치한 희나리 앱에서만 알림을 받을 수 있어요. 설치한 뒤 앱에서 켜주세요.</p>
      ) : support === 'no-config' ? (
        <p className="settings-note">알림 설정이 아직 준비되지 않았어요.</p>
      ) : (
        <p className="settings-note">이 브라우저는 알림을 지원하지 않아요.</p>
      )}

      {message && <p className="form-message" role="status" data-tone={message.tone}>{message.text}</p>}
    </div>
  );
}
