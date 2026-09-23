import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppShell from './AppShell';
import Login from './Login';
import { HomePage, MyPage, SchedulePage } from './pages';

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

vi.mock('./schedule/useScheduleData', () => ({
  useUpcomingEvent: () => ({ ...schedule.upcoming, refresh: vi.fn() }),
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
    expect(screen.getByRole('link', { name: '일정 화면에서 예약하기' }).getAttribute('href')).toBe('/schedule');
  });

  it('일정 화면은 달력·선택일 빈 상태와 하나의 일정 추가 버튼을 보여준다', () => {
    render(<SchedulePage />);
    expect(screen.getByRole('heading', { name: '일정', level: 1 })).toBeTruthy();
    expect(screen.getByText('이 날은 일정이 없어요')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '일정 추가' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '공간 예약' })).toBeNull();
  });

  it('홈은 다음 일정과 오늘 일정 요약을 보여준다', () => {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    schedule.upcoming = {
      status: 'ready',
      data: { id: 'e1', title: '가을 정기 공연', description: null, location: '대강당', startAt: start, endAt: null, allDay: false, tag: null, createdBy: 'a' },
    };
    const todayStart = new Date();
    schedule.today = {
      status: 'ready',
      data: {
        reservations: [],
        events: [1, 2, 3, 4].map((n) => ({
          id: `t${n}`, title: `오늘 일정 ${n}`, description: null, location: n === 1 ? '대강당' : null,
          startAt: todayStart, endAt: null, allDay: true, tag: null, createdBy: 'a',
        })),
      },
    };
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    const card = screen.getByRole('region', { name: '다음 일정' });
    expect(card.textContent).toContain('가을 정기 공연');
    expect(card.textContent).toContain('대강당');
    expect(card.textContent).toMatch(/\d+월 \d+일 \(.\) · \d{2}:\d{2}/);
    const summary = screen.getByRole('list', { name: '오늘 일정 요약' });
    expect(summary.textContent).toContain('오늘 일정 1');
    expect(summary.textContent).not.toContain('오늘 일정 4');
    expect(summary.textContent).toContain('외 1건');
    expect(summary.textContent).toContain('대강당');
    expect(screen.getByRole('link', { name: '일정 화면으로 이동' }).getAttribute('href')).toBe('/schedule');
  });

  it('홈은 일정이 없거나 불러오는 중·실패일 때 상태를 구분한다', async () => {
    const { rerender } = render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByText('예정된 동아리 일정이 없어요')).toBeTruthy();
    expect(screen.getByText('오늘은 예정된 일정이 없어요')).toBeTruthy();

    schedule.upcoming = { status: 'loading', data: null };
    schedule.today = { ...schedule.today, status: 'loading' };
    rerender(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByText('다음 일정을 확인하고 있어요')).toBeTruthy();
    expect(screen.getByText('오늘 일정을 확인하고 있어요')).toBeTruthy();

    schedule.upcoming = { status: 'error', data: null };
    schedule.today = { ...schedule.today, status: 'error' };
    rerender(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(screen.getByText('일정을 불러오지 못했어요')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }));
    expect(schedule.refresh).toHaveBeenCalledOnce();
  });

  it('내 정보에서 로그아웃할 수 있다', async () => {
    const user = userEvent.setup();
    render(<MyPage />);
    await user.click(screen.getByRole('button', { name: /로그아웃/ }));
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});
