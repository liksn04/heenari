import { useState } from 'react';
import { CalendarDays, ChevronRight, Clock3, LogOut, UserPen } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useHeenariAuth } from './auth/authState';
import { ReservationList } from './reservations/ReservationList';
import { useMyUpcomingReservations } from './reservations/useMyUpcomingReservations';
import { dayKeyOf, timeLabelOf } from './reservations/slots';
import { ScheduleBoard } from './schedule/ScheduleBoard';
import { AppSettings } from './push/AppSettings';
import { ProfileSheet } from './members/ProfileSheet';
import { useMyProfile } from './members/useMyProfile';
import { buildTimeline } from './schedule/timeline';
import { useDayTimeline, useNextJam } from './schedule/useScheduleData';
import { NextJamCard } from './home/NextJamCard';
import { useMembers } from './members/useMembers';

const TODAY_SUMMARY_LIMIT = 3;

function useViewer() {
  const { user, member } = useHeenariAuth();
  return { uid: user?.uid ?? '', name: member?.name ?? '회원' };
}

export function HomePage() {
  const { member } = useHeenariAuth();
  const viewer = useViewer();
  const { reservations } = useMyUpcomingReservations(viewer.uid);
  const nextReservation = reservations[0] ?? null;
  const nextJam = useNextJam();
  const members = useMembers();
  const todayKey = dayKeyOf(new Date());
  const todayTimeline = useDayTimeline(todayKey);
  const todayItems = buildTimeline(todayKey, todayTimeline.data.reservations, todayTimeline.data.events);
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
        <p>다가오는 합주와 오늘 일정을 확인해보세요.</p>
      </section>

      <NextJamCard next={nextJam} names={members.names} />

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CLUB ROOM</p>
            <h2>내 다음 동아리방 시간</h2>
          </div>
          <Link className="round-button" to="/schedule" aria-label="일정 화면에서 예약하기"><ChevronRight /></Link>
        </div>
        {nextReservation ? (
          <div className="next-reservation">
            <p className="reservation-time">
              {nextReservation.dayKey} · {timeLabelOf(nextReservation.startAt)}–{timeLabelOf(nextReservation.endAt)}
            </p>
            <strong>{nextReservation.title}</strong>
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <Clock3 size={25} aria-hidden="true" />
            <div>
              <strong>잡아둔 동아리방 시간이 없어요</strong>
              <p>일정에서 장소를 동아리방으로 두면 30분 단위로 잡아둘 수 있어요.</p>
            </div>
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TODAY</p>
            <h2>오늘 일정</h2>
          </div>
          <Link className="round-button" to="/schedule" aria-label="일정 화면으로 이동"><ChevronRight /></Link>
        </div>
        {todayTimeline.status === 'error' ? (
          <p className="form-message" role="status" data-tone="error">
            오늘 일정을 불러오지 못했어요.
            <button type="button" className="link-button" onClick={() => void todayTimeline.refresh()}>다시 시도</button>
          </p>
        ) : todayItems.length > 0 ? (
          <ul className="today-list" aria-label="오늘 일정 요약">
            {todayItems.slice(0, TODAY_SUMMARY_LIMIT).map((item) => (
              <li key={`${item.kind}-${item.id}`} className="today-item" data-kind={item.kind}>
                <span className="timeline-time">{item.timeLabel}</span>
                <strong>{item.title}</strong>
                {item.place && <span className="today-place">{item.place}</span>}
              </li>
            ))}
            {todayItems.length > TODAY_SUMMARY_LIMIT && (
              <li className="today-more">외 {todayItems.length - TODAY_SUMMARY_LIMIT}건은 일정 화면에서 확인하세요.</li>
            )}
          </ul>
        ) : (
          <div className="empty-state compact-empty">
            <CalendarDays size={25} aria-hidden="true" />
            <div>
              <strong>{todayTimeline.status === 'loading' ? '오늘 일정을 확인하고 있어요' : '오늘은 예정된 일정이 없어요'}</strong>
              <p>예약과 동아리 일정이 생기면 이곳에 모아 보여드려요.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function SchedulePage() {
  const { member } = useHeenariAuth();
  const viewer = useViewer();
  const [params] = useSearchParams();
  return <ScheduleBoard viewer={{ ...viewer, isAdmin: member?.role === 'admin' }} initialDay={params.get('day')} />;
}

export function MyPage() {
  const { member, signOut, updateMemberName } = useHeenariAuth();
  const viewer = useViewer();
  const myProfile = useMyProfile(viewer.uid);
  const [editing, setEditing] = useState(false);
  const profile = myProfile.profile;
  const displayName = profile?.name ?? member?.name ?? '회원';
  return (
    <div className="page-stack">
      <section className="profile-card">
        <div className="profile-avatar">{displayName.slice(0, 1)}</div>
        <div className="profile-info">
          <p className="eyebrow">{member?.role === 'admin' ? 'ADMIN' : 'MEMBER'}</p>
          <h1>{displayName}</h1>
          {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
          <p>{member?.email}</p>
        </div>
      </section>
      <button
        type="button"
        className="secondary-button"
        disabled={myProfile.status === 'loading'}
        onClick={() => setEditing(true)}
      >
        <UserPen size={18} aria-hidden="true" /> 프로필 편집
      </button>
      {editing && (
        <ProfileSheet
          uid={viewer.uid}
          initial={profile ?? { name: displayName, bio: null }}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            myProfile.replace(saved);
            updateMemberName(saved.name);
            setEditing(false);
          }}
        />
      )}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MY CLUB ROOM</p>
            <h2>내 동아리방 시간</h2>
          </div>
        </div>
        <ReservationList viewer={viewer} />
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">APP &amp; ALERTS</p>
            <h2>앱과 알림</h2>
          </div>
        </div>
        <AppSettings uid={viewer.uid} />
      </section>

      <button className="secondary-button" type="button" onClick={() => void signOut()}>
        <LogOut size={18} /> 로그아웃
      </button>
    </div>
  );
}
