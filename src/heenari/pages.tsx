import { CalendarDays, ChevronRight, Clock3, LogOut, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useHeenariAuth } from './auth/authState';

export function HomePage() {
  const { member } = useHeenariAuth();
  const today = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());

  return (
    <div className="page-stack home-page">
      <section className="welcome-block">
        <p className="eyebrow">{today}</p>
        <h1>{member?.name}님,<br />오늘도 반가워요.</h1>
        <p>희나리의 다음 일정과 공간 예약을 확인해보세요.</p>
      </section>

      <section className="next-event-card">
        <div>
          <p className="card-kicker"><Sparkles size={15} /> 다음 동아리 일정</p>
          <h2>첫 일정을 준비하고 있어요</h2>
          <p>운영진이 일정을 등록하면 가장 먼저 이곳에 표시됩니다.</p>
        </div>
        <CalendarDays size={34} strokeWidth={1.4} aria-hidden="true" />
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SPACE</p>
            <h2>다음 공간 예약</h2>
          </div>
          <Link className="round-button" to="/reserve" aria-label="예약 화면으로 이동"><ChevronRight /></Link>
        </div>
        <div className="empty-state compact-empty">
          <Clock3 size={25} aria-hidden="true" />
          <div>
            <strong>예정된 예약이 없습니다</strong>
            <p>필요한 시간을 30분 단위로 예약할 수 있어요.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ReservePage() {
  return (
    <div className="page-stack">
      <section className="page-title">
        <p className="eyebrow">30 MINUTE SLOT</p>
        <h1>공간 예약</h1>
        <p>30분 단위 예약 기능은 다음 구현 게이트에서 연결됩니다.</p>
      </section>
      <div className="slot-preview" aria-label="예약 슬롯 미리보기">
        {['18:00', '18:30', '19:00', '19:30', '20:00', '20:30'].map((time, index) => (
          <button key={time} disabled className={index === 2 ? 'preview-selected' : ''}>
            <span>{time}</span>
            <small>{index === 2 ? '선택 예시' : '예약 가능'}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SchedulePage() {
  return (
    <div className="page-stack">
      <section className="page-title">
        <p className="eyebrow">CLUB CALENDAR</p>
        <h1>희나리 일정</h1>
        <p>예약과 동아리 일정을 한 흐름으로 보여줄 화면입니다.</p>
      </section>
      <div className="empty-state">
        <CalendarDays size={30} aria-hidden="true" />
        <strong>아직 등록된 일정이 없어요</strong>
        <p>일정 기능은 예약 엔진 다음 게이트에서 연결됩니다.</p>
      </div>
    </div>
  );
}

export function MyPage() {
  const { member, signOut } = useHeenariAuth();
  return (
    <div className="page-stack">
      <section className="profile-card">
        <div className="profile-avatar">{member?.name.slice(0, 1)}</div>
        <div>
          <p className="eyebrow">{member?.role === 'admin' ? 'ADMIN' : 'MEMBER'}</p>
          <h1>{member?.name}</h1>
          <p>{member?.email}</p>
        </div>
      </section>
      <button className="secondary-button" type="button" onClick={() => void signOut()}>
        <LogOut size={18} /> 로그아웃
      </button>
    </div>
  );
}
