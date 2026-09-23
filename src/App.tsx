import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './heenari/auth/AuthContext';
import { useHeenariAuth } from './heenari/auth/authState';
import AppShell from './heenari/AppShell';
import Login from './heenari/Login';
import { HomePage, MyPage, SchedulePage } from './heenari/pages';

function AppRoutes() {
  const { status } = useHeenariAuth();

  if (status === 'booting') {
    return <div className="app-loading"><img src="/heenari-logo.jpeg" alt="" /><p>희나리를 준비하고 있어요</p></div>;
  }

  if (status === 'setup-error') {
    return (
      <main className="setup-page">
        <img className="brand-logo-thumb" src="/heenari-logo.jpeg" alt="" width="56" height="56" />
        <p className="eyebrow">SETUP REQUIRED</p>
        <h1>Firebase 연결이 필요합니다</h1>
        <p><code>.env.example</code>을 참고해 로컬 환경 변수를 설정해주세요.</p>
      </main>
    );
  }

  if (status !== 'allowed') {
    return <Login />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="reserve" element={<Navigate to="/schedule" replace />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="me" element={<MyPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
