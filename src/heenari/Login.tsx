import { useState } from 'react';
import { useHeenariAuth } from './auth/authState';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.55l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
    </svg>
  );
}

export default function Login() {
  const { loginWithGoogle, notice, clearNotice } = useHeenariAuth();
  const [rememberMe, setRememberMe] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleGoogleLogin() {
    clearNotice();
    setMessage(null);
    setSubmitting(true);
    try {
      await loginWithGoogle(rememberMe);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google 로그인을 시작하지 못했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="login-title">
        <div className="brand-lockup">
          <img className="brand-logo-thumb" src="/heenari-logo.jpeg" alt="" width="46" height="46" />
          <span>희나리</span>
        </div>
        <div className="story-logo-card" aria-hidden="true">
          <img src="/heenari-logo.jpeg" alt="" />
        </div>
        <div className="story-copy">
          <p className="eyebrow">HEENARI MEMBERS</p>
          <h1 id="login-title">우리의 시간을<br />가볍게 맞춰요.</h1>
          <p>공간 예약과 동아리 일정을 한곳에서 확인하는 희나리 회원 전용 공간입니다.</p>
        </div>
        <div className="story-note" aria-hidden="true">
          <span>30</span>
          <p>분 단위로<br />정확한 예약</p>
        </div>
      </section>

      <section className="login-panel" aria-label="회원 로그인">
        <div className="login-form-wrap">
          <div className="mobile-brand">
            <img className="brand-logo-thumb" src="/heenari-logo.jpeg" alt="" width="40" height="40" />
            <span>희나리</span>
          </div>
          <p className="eyebrow">WELCOME</p>
          <h2>희나리 시작하기</h2>
          <p className="form-intro">사용 중인 Google 계정으로 간편하게 로그인하세요.</p>

          <div className="login-actions">
            <label className="remember-row">
              <input
                type="checkbox"
                aria-label="로그인 상태 유지"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                disabled={submitting}
              />
              <span>
                <strong>로그인 상태 유지</strong>
                <small aria-hidden="true">PWA를 닫았다 열어도 다시 로그인하지 않아요.</small>
              </span>
            </label>

            {(message || notice) && <p className="form-message" role="status">{message || notice}</p>}

            <button className="google-button" type="button" onClick={() => void handleGoogleLogin()} disabled={submitting}>
              <GoogleIcon />
              <span>{submitting ? 'Google로 이동하고 있어요' : 'Google로 계속하기'}</span>
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
