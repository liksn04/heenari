import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { kstInstant } from './eventPolicy';
import type { ClubEventView } from './types';

const m = vi.hoisted(() => ({
  fetchDayReservations: vi.fn(),
  fetchEventsBetween: vi.fn(),
  fetchUpcomingJamEvents: vi.fn(),
  fetchUpcomingJamReservations: vi.fn(),
}));

vi.mock('../reservations/repository', () => ({
  fetchDayReservations: m.fetchDayReservations,
  fetchUpcomingJamReservations: m.fetchUpcomingJamReservations,
}));
vi.mock('./eventRepository', () => ({
  fetchEventsBetween: m.fetchEventsBetween,
  fetchUpcomingJamEvents: m.fetchUpcomingJamEvents,
}));

import { useDayTimeline, useMonthEventDays, useNextJam } from './useScheduleData';

function event(id: string, start: Date, overrides: Partial<ClubEventView> = {}): ClubEventView {
  return { id, title: id, description: null, location: null, startAt: start, endAt: null, allDay: false, tag: null, participantIds: [], createdBy: 'a', ...overrides };
}

beforeEach(() => {
  m.fetchDayReservations.mockReset().mockResolvedValue([]);
  m.fetchEventsBetween.mockReset().mockResolvedValue([]);
  m.fetchUpcomingJamEvents.mockReset().mockResolvedValue([]);
  m.fetchUpcomingJamReservations.mockReset().mockResolvedValue([]);
});

afterEach(cleanup);

describe('useDayTimeline', () => {
  it('선택일의 예약과 일정을 함께 불러온다', async () => {
    const events = [event('e1', kstInstant('2026-10-02', '19:00'))];
    m.fetchEventsBetween.mockResolvedValue(events);
    const { result } = renderHook(() => useDayTimeline('2026-10-02'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data.events).toEqual(events);
    expect(m.fetchDayReservations).toHaveBeenCalledWith('2026-10-02');
    expect(m.fetchEventsBetween).toHaveBeenCalledWith(kstInstant('2026-10-02'), kstInstant('2026-10-03'));
  });

  it('둘 중 하나라도 실패하면 오류 상태가 되고 refresh로 복구한다', async () => {
    m.fetchEventsBetween.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useDayTimeline('2026-10-02'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.status).toBe('ready');
  });

  it('refresh 실패도 오류 상태로 남긴다', async () => {
    const { result } = renderHook(() => useDayTimeline('2026-10-02'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    m.fetchDayReservations.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.status).toBe('error');
  });

  it('날짜가 바뀌면 이전 날짜 데이터를 버리고 다시 불러온다', async () => {
    m.fetchEventsBetween.mockResolvedValueOnce([event('old', kstInstant('2026-10-02', '19:00'))]);
    const { result, rerender } = renderHook(({ day }) => useDayTimeline(day), { initialProps: { day: '2026-10-02' } });
    await waitFor(() => expect(result.current.data.events).toHaveLength(1));
    rerender({ day: '2026-10-03' });
    expect(result.current.status).toBe('loading');
    expect(result.current.data.events).toHaveLength(0);
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });
});

describe('useMonthEventDays', () => {
  it('해당 달의 일정 날짜 집합을 만든다', async () => {
    m.fetchEventsBetween.mockResolvedValue([event('e', kstInstant('2026-10-15', '19:00'))]);
    const { result } = renderHook(() => useMonthEventDays('2026-10-01'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect([...result.current.data]).toEqual(['2026-10-15']);
    expect(m.fetchEventsBetween).toHaveBeenCalledWith(kstInstant('2026-10-01'), kstInstant('2026-11-01'));
  });
});

describe('useNextJam', () => {
  it('동아리방 합주와 합주 일정 중 끝나지 않은 가장 이른 것을 고른다', async () => {
    const hour = 60 * 60 * 1000;
    m.fetchUpcomingJamEvents.mockResolvedValue([
      event('ended', new Date(Date.now() - 2 * hour), { tag: 'jam', endAt: new Date(Date.now() - hour) }),
      event('outside', new Date(Date.now() + 2 * hour), { tag: 'jam' }),
    ]);
    m.fetchUpcomingJamReservations.mockResolvedValue([{
      id: 'room', title: '합주', note: null, ownerId: 'u1', ownerName: '김희나',
      startAt: new Date(Date.now() + hour), endAt: new Date(Date.now() + 2 * hour),
      dayKey: '2026-10-02', slotIds: [], tag: 'jam', participantIds: [],
    }]);
    const { result } = renderHook(() => useNextJam());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toMatchObject({ kind: 'reservation', id: 'room' });
    expect(m.fetchUpcomingJamReservations).toHaveBeenCalledWith(m.fetchUpcomingJamEvents.mock.calls[0][0]);
  });

  it('실패하면 null과 오류 상태', async () => {
    m.fetchUpcomingJamReservations.mockRejectedValue(new Error('x'));
    const { result } = renderHook(() => useNextJam());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBeNull();
  });
});
