import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { kstInstant } from './eventPolicy';
import { dayKeyOf } from '../reservations/slots';
import { addMonths, startOfMonth } from '../reservations/calendar';
import type { ClubEventView } from './types';
import type { ReservationView } from '../reservations/types';

const today = dayKeyOf(new Date());
const HOUR = 3600e3;

const m = vi.hoisted(() => ({
  day: {
    status: 'ready' as 'loading' | 'ready' | 'error',
    reservations: [] as ReservationView[],
    events: [] as ClubEventView[],
  },
  eventDays: new Set<string>(),
  refresh: vi.fn(),
  dayCalls: [] as [string, number][],
  monthCalls: [] as [string, number][],
  sheetModes: [] as unknown[],
}));

vi.mock('./useScheduleData', () => ({
  useDayTimeline: (dayKey: string, version: number) => {
    m.dayCalls.push([dayKey, version]);
    return { status: m.day.status, data: { reservations: m.day.reservations, events: m.day.events }, refresh: m.refresh };
  },
  useMonthEventDays: (month: string, version: number) => {
    m.monthCalls.push([month, version]);
    return { status: 'ready', data: m.eventDays, refresh: vi.fn() };
  },
}));

// 시트 자체는 EntrySheet.test에서 검증한다. 여기서는 어떤 모드로 열리는지와 저장 후 흐름만 본다.
vi.mock('./EntrySheet', () => ({
  EntrySheet: ({ mode, onClose, onSaved, onStale }: {
    mode: { kind: string };
    onClose: () => void;
    onSaved: (message: string) => void;
    onStale: () => void;
  }) => {
    m.sheetModes.push(mode);
    return (
      <div role="dialog" aria-label={mode.kind}>
        <button type="button" onClick={() => onSaved('일정을 추가했어요.')}>저장</button>
        <button type="button" onClick={onStale}>충돌</button>
        <button type="button" onClick={onClose}>닫기</button>
      </div>
    );
  },
}));

import { ScheduleBoard } from './ScheduleBoard';

const member = { uid: 'u1', name: '김희나', isAdmin: false };
const admin = { uid: 'admin-x', name: '운영진', isAdmin: true };

function reservation(overrides: Partial<ReservationView> = {}): ReservationView {
  const start = new Date(Date.now() + 2 * HOUR);
  return {
    id: 'r1', title: '보컬 연습', note: null, ownerId: 'u2', ownerName: '이나리',
    startAt: start, endAt: new Date(start.getTime() + HOUR), dayKey: today, slotIds: [], tag: 'jam',
    ...overrides,
  };
}

function event(overrides: Partial<ClubEventView> = {}): ClubEventView {
  return {
    id: 'e1', title: '정기 총회', description: null, location: '강당',
    startAt: kstInstant(today), endAt: null, allDay: true, tag: 'etc', createdBy: 'admin-x',
    ...overrides,
  };
}

beforeEach(() => {
  m.day.status = 'ready';
  m.day.reservations = [reservation()];
  m.day.events = [event()];
  m.eventDays = new Set([today]);
  m.refresh.mockReset();
  m.dayCalls.length = 0;
  m.monthCalls.length = 0;
  m.sheetModes.length = 0;
});

afterEach(cleanup);

describe('ScheduleBoard', () => {
  it('예약과 일정을 구분 없이 한 목록에 장소·작성자와 함께 보여준다', () => {
    render(<ScheduleBoard viewer={member} />);
    const items = within(screen.getByRole('list', { name: '선택일 일정' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('종일기타정기 총회 강당');
    expect(items[1].textContent).toContain('합주보컬 연습 동아리방 · 이나리');
    expect(screen.queryByRole('group', { name: '일정 필터' })).toBeNull();
    expect(screen.getByRole('button', { name: `${today} 일정 있음` })).toBeTruthy();
  });

  it('비어 있으면 빈 상태, 불러오는 중·오류 상태를 보여준다', async () => {
    m.day.reservations = [];
    m.day.events = [];
    const { rerender } = render(<ScheduleBoard viewer={member} />);
    expect(screen.getByText('이 날은 일정이 없어요')).toBeTruthy();
    m.day.status = 'loading';
    rerender(<ScheduleBoard viewer={member} />);
    expect(screen.getByText('일정을 불러오고 있어요…')).toBeTruthy();
    m.day.status = 'error';
    rerender(<ScheduleBoard viewer={member} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }));
    expect(m.refresh).toHaveBeenCalledOnce();
  });

  it('달을 넘기고 날짜를 고르면 해당 날짜를 불러온다', async () => {
    const user = userEvent.setup();
    render(<ScheduleBoard viewer={member} />);
    await user.click(screen.getByRole('button', { name: '다음 달' }));
    const nextMonth = addMonths(startOfMonth(today), 1);
    expect(m.monthCalls.at(-1)).toEqual([nextMonth, 0]);
    await user.click(screen.getByRole('button', { name: nextMonth }));
    expect(m.dayCalls.at(-1)).toEqual([nextMonth, 0]);
    await user.click(screen.getByRole('button', { name: '이전 달' }));
    expect(m.monthCalls.at(-1)).toEqual([startOfMonth(today), 0]);
  });

  it('회원도 하나의 일정 추가 버튼으로 선택일 추가 시트를 열고, 저장 후 다시 불러온다', async () => {
    const user = userEvent.setup();
    render(<ScheduleBoard viewer={member} />);
    await user.click(screen.getByRole('button', { name: '일정 추가' }));
    expect(m.sheetModes.at(-1)).toEqual({ kind: 'create', dayKey: today });
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('일정을 추가했어요.');
    expect(m.dayCalls.at(-1)).toEqual([today, 1]);
    expect(m.monthCalls.at(-1)).toEqual([startOfMonth(today), 1]);
  });

  it('슬롯 충돌이면 시트는 그대로 두고 목록만 다시 불러온다', async () => {
    const user = userEvent.setup();
    render(<ScheduleBoard viewer={member} />);
    await user.click(screen.getByRole('button', { name: '일정 추가' }));
    await user.click(screen.getByRole('button', { name: '충돌' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(m.dayCalls.at(-1)).toEqual([today, 1]);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('회원은 본인의 시작 전 예약과 본인이 만든 일정만 수정할 수 있다', async () => {
    m.day.reservations = [
      reservation({ id: 'mine', title: '내 합주', ownerId: 'u1' }),
      reservation({ id: 'theirs', title: '남의 합주', ownerId: 'u2' }),
      reservation({ id: 'past', title: '지난 합주', ownerId: 'u1', startAt: new Date(Date.now() - HOUR), endAt: new Date(Date.now() + 1000) }),
    ];
    m.day.events = [event({ id: 'e-mine', title: '내 모임', createdBy: 'u1' }), event()];
    const user = userEvent.setup();
    render(<ScheduleBoard viewer={member} />);
    expect(screen.getAllByText('내 일정')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: '남의 합주 수정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '지난 합주 수정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '정기 총회 수정' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '내 합주 수정' }));
    expect(m.sheetModes.at(-1)).toMatchObject({ kind: 'edit-reservation', reservation: { id: 'mine' } });
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(screen.getByRole('button', { name: '내 모임 수정' }));
    expect(m.sheetModes.at(-1)).toMatchObject({ kind: 'edit-event', event: { id: 'e-mine' } });
  });

  it('관리자는 모든 일정을 수정할 수 있지만 남의 예약은 수정할 수 없다', () => {
    render(<ScheduleBoard viewer={admin} />);
    expect(screen.getByRole('button', { name: '정기 총회 수정' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '보컬 연습 수정' })).toBeNull();
  });
});
