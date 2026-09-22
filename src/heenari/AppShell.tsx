import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Clock3, Home, UserRound } from 'lucide-react';
import { useHeenariAuth } from './auth/authState';

const navigation = [
  { to: '/', label: '홈', icon: Home, end: true },
  { to: '/reserve', label: '예약', icon: Clock3, end: false },
  { to: '/schedule', label: '일정', icon: CalendarDays, end: false },
  { to: '/me', label: '내 정보', icon: UserRound, end: false },
];

export default function AppShell() {
  const { member } = useHeenariAuth();

  return (
    <div className="app-frame">
      <header className="app-header">
        <div className="brand-lockup compact">
          <img className="brand-logo-thumb" src="/heenari-logo.jpeg" alt="" width="38" height="38" />
          <span>희나리</span>
        </div>
        <div className="member-chip">
          <span>{member?.role === 'admin' ? '운영진' : '회원'}</span>
          <strong>{member?.name}</strong>
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
