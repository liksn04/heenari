import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppShell from './AppShell';
import Login from './Login';
import { HomePage, MyPage, NoticesPage, SchedulePage } from './pages';

const auth = vi.hoisted(() => ({
  member: {
    name: '김희나',
    email: 'heena@example.com',
    role: 'member' as 'member' | 'admin',
    active: true,
  },
  notice: null as string | null,
  loginWithGoogle: vi.fn(),
  signOut: vi.fn(),
  clearNotice: vi.fn(),
  updateMemberName: vi.fn(),
}));

vi.mock('./auth/authState', () => ({
  useHeenariAuth: () => auth,
}));

vi.mock('./reservations/useDayReservations', () => ({
  useDayReservations: () => ({ status: 'ready', reservations: [], slots: [], error: null, refresh: vi.fn() }),
}));

vi.mock('./reservations/useMyUpcomingReservations', () => ({
  useMyUpcomingReservations: () => ({ status: 'ready', reservations: [], error: null, refresh: vi.fn() }),
}));

const schedule = vi.hoisted(() => ({
  upcoming: { status: 'ready' as 'loading' | 'ready' | 'error', data: null as unknown },
  today: {
    status: 'ready' as 'loading' | 'ready' | 'error',
    data: { reservations: [] as unknown[], events: [] as unknown[] },
  },
  refresh: vi.fn(),
}));

const profileState = vi.hoisted(() => ({
  current: { status: 'ready', profile: { name: '김희나', bio: '주말 합주 환영' } as null | { name: string; bio: string | null } },
  replace: vi.fn(),
}));

vi.mock('./members/useMyProfile', () => ({ useMyProfile: () => ({ ...profileState.current, replace: profileState.replace }) }));
vi.mock('./members/ProfileSheet', () => ({
  ProfileSheet: ({ onSaved, onClose }: { onSaved: (p: { name: string; bio: null }) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="프로필 편집">
      <button type="button" onClick={() => onSaved({ name: '희나', bio: null })}>저장</button>
      <button type="button" onClick={onClose}>닫기</button>
    </div>
  ),
}));

vi.mock('./members/useMembers', () => ({
  useMembers: () => ({ status: 'ready', members: [], names: new Map([['u1', '김희나'], ['u2', '박드럼']]) }),
}));

vi.mock('./notices/useNotices', () => ({
  useNotices: () => ({ status: 'ready', data: [], refresh: vi.fn() }),
}));

vi.mock('./schedule/useScheduleData', () => ({
  useNextJam: () => ({ ...schedule.upcoming, refresh: vi.fn() }),
  useDayTimeline: () => ({ ...schedule.today, refresh: schedule.refresh }),
  useMonthEventDays: () => ({ status: 'ready', data: new Set<string>(), refresh: vi.fn() }),
}));

beforeEach(() => {
  schedule.upcoming = { status: 'ready', data: null };
  schedule.today = { status: 'ready', data: { reservations: [], events: [] } };
  schedule.refresh.mockReset();
  auth.member.role = 'member';
  auth.notice = null;
  auth.loginWithGoogle.mockReset();
  auth.signOut.mockReset();
  auth.clearNotice.mockReset();
});

afterEach(cleanup);

describe('Login', () => {
  it('기본적으로 로그인 상태를 유지하며 Google 로그인을 요청한다', async () => {
    const user = userEvent.setup();
    render(<Login />);

    await user.click(screen.getByRole('button', { name: 'Google로 계속하기' }));

    expect(auth.loginWithGoogle).toHaveBeenCalledWith(true);
  });

  it('로그인 상태 유지를 해제하면 세션 로그인을 요청한다', async () => {
    const user = userEvent.setup();
    render(<Login />);

    await user.click(screen.getByRole('checkbox', { name: '로그인 상태 유지' }));
    await user.click(screen.getByRole('button', { name: 'Google로 계속하기' }));

    expect(auth.loginWithGoogle).toHaveBeenCalledWith(false);
  });

  it('Google 로그인 시작 실패를 사용자에게 안내한다', async () => {
    const user = userEvent.setup();
    auth.loginWithGoogle.mockRejectedValueOnce(new Error('Google 로그인이 차단됐습니다.'));
    render(<Login />);

    await user.click(screen.getByRole('button', { name: 'Google로 계속하기' }));

    expect(screen.getByRole('status').textContent).toBe('Google 로그인이 차단됐습니다.');
  });

  it('인증 컨텍스트 안내를 로그인 화면에 표시한다', () => {
    auth.notice = '검증된 Google 계정으로 로그인해주세요.';
    render(<Login />);

    expect(screen.getByRole('status').textContent).toBe('검증된 Google 계정으로 로그인해주세요.');
  });
});

describe('AppShell', () => {
  it('회원 정보와 네 개의 주요 메뉴를 표시한다', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<p>홈 내용</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('김희나')).toBeTruthy();
    const links = [...screen.getByRole('navigation', { name: '주요 메뉴' }).querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/schedule', '/me']);
    expect(screen.getByText('홈 내용')).toBeTruthy();
  });

  it('관리자 역할을 운영진으로 표시한다', () => {
    auth.member.role = 'admin';
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<p>홈 내용</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('운영진')).toBeTruthy();
  });
});

describe('core pages', () => {
  it('홈에서 회원 이름과 예약 이동 링크를 보여준다', () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /김희나님/ })).toBeTruthy();
    const regions = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));
    expect(regions.slice(0, 2)).toEqual(['다음 합주', '동아리 공지']);
    expect(screen.getByRole('link', { name: '일정 화면에서 예약하기' }).getAttribute('href')).toBe('/schedule');
  });

  it('공지 화면은 동아리 공지 전체를 보여준다', () => {
    render(<MemoryRouter initialEntries={['/notices']}><NoticesPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: '동아리 공지' })).toBeTruthy();
  });

  it('일정 화면은 달력·선택일 빈 상태와 하나의 일정 추가 버튼을 보여준다', () => {
    render(<MemoryRouter initialEntries={["/schedule"]}><SchedulePage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: '일정', level: 1 })).toBeTruthy();
    expect(screen.getByText('이 날은 일정이 없어요')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '일정 추가' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '공간 예약' })).toBeNull();
  });

  it('홈 빨간 카드는 동아리 전체의 다음 합주와 오늘 일정 요약을 보여준다', () => {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const reservation = {
      id: 'r1', title: '금요 합주', note: null, ownerId: 'u9', ownerName: '이기타', startAt: start,
      endAt: new Date(start.getTime() + 60 * 60 * 1000), dayKey: '2026-10-02', slotIds: [], tag: 'jam', participantIds: ['u2', 'u3'],
    };
    schedule.upcoming = {
      status: 'ready',
      data: {
        kind: 'reservation', id: 'r1', title: '금요 합주', startAt: start, allDay: false, timeLabel: '19:00–20:00', tag: 'jam',
        place: '동아리방', ownerId: 'u9', participantIds: ['u2', 'u3'], ownerName: '이기타', reservation,
      },
    };
    const todayStart = new Date();
    schedule.today = {
      status: 'ready',
      data: {
        reservations: [],
        events: [1, 2, 3, 4].map((n) => ({
          id: `t${n}`, title: `오늘 일정 ${n}`, description: null, location: n === 1 ? '대강당' : null,
          startAt: todayStart, endAt: null, allDay: true, tag: null, participantIds: [], createdBy: 'a',
        })),
      },
    };
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    const card = screen.getByRole('region', { name: '다음 합주' });
    expect(card.textContent).toContain('금요 합주');
    expect(card.textContent).toContain('동아리방');
    expect(card.textContent).toMatch(/\d+월 \d+일 \(.\) · 19:00–20:00/);
    expect(card.textContent).toContain('이기타 · 함께: 회원 2명');
    expect(card.querySelector('a')?.getAttribute('href')).toMatch(/^\/schedule\?day=\d{4}-\d{2}-\d{2}$/);
    const summary = screen.getByRole('list', { name: '오늘 일정 요약' });
    expect(summary.textContent).toContain('오늘 일정 1');
    expect(summary.textContent).not.toContain('오늘 일정 4');
    expect(summary.textContent).toContain('외 1건');
    expect(summary.textContent).toContain('대강당');
    expect(screen.getByRole('link', { name: '일정 화면으로 이동' }).getAttribute('href')).toBe('/schedule');
  });

  it('홈은 일정이 없거나 불러오는 중·실패일 때 상태를 구분한다', async () => {
    const { rerender } = render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByText('예정된 합주가 없어요')).toBeTruthy();
    expect(screen.getByText('오늘은 예정된 일정이 없어요')).toBeTruthy();

    schedule.upcoming = { status: 'loading', data: null };
    schedule.today = { ...schedule.today, status: 'loading' };
    rerender(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByText('다음 합주를 확인하고 있어요')).toBeTruthy();
    expect(screen.getByText('오늘 일정을 확인하고 있어요')).toBeTruthy();

    schedule.upcoming = { status: 'error', data: null };
    schedule.today = { ...schedule.today, status: 'error' };
    rerender(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByText('합주를 불러오지 못했어요')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }));
    expect(schedule.refresh).toHaveBeenCalledOnce();
  });

  it('내 정보는 프로필(이름·한줄소개)을 보여주고 편집하면 이름을 반영한다', async () => {
    const user = userEvent.setup();
    render(<MyPage />);
    expect(screen.getByRole('heading', { name: '김희나' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: '담당 세션' })).toBeNull();
    expect(screen.getByText('주말 합주 환영')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /프로필 편집/ }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(profileState.replace).toHaveBeenCalledWith({ name: '희나', bio: null });
    expect(auth.updateMemberName).toHaveBeenCalledWith('희나');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: /프로필 편집/ }));
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('프로필을 아직 못 불러오면 로그인 이름으로 보여준다', () => {
    profileState.current = { status: 'loading', profile: null };
    render(<MyPage />);
    expect(screen.getByRole('heading', { name: '김희나' })).toBeTruthy();
    expect((screen.getByRole('button', { name: /프로필 편집/ }) as HTMLButtonElement).disabled).toBe(true);
    profileState.current = { status: 'ready', profile: { name: '김희나', bio: '주말 합주 환영' } };
  });

  it('내 정보에서 로그아웃할 수 있다', async () => {
    const user = userEvent.setup();
    render(<MyPage />);
    await user.click(screen.getByRole('button', { name: /로그아웃/ }));
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});
