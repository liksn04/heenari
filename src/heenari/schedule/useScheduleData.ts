import { useCallback, useEffect, useState } from 'react';
import { fetchDayReservations } from '../reservations/repository';
import type { ReservationView } from '../reservations/types';
import { fetchEventsBetween, fetchUpcomingEventCandidates } from './eventRepository';
import { dayRange, eventDaysInMonth, nextUpcomingEvent } from './timeline';
import { addMonths } from '../reservations/calendar';
import { kstInstant } from './eventPolicy';
import type { ClubEventView } from './types';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface Loaded<T> {
  status: LoadStatus;
  data: T;
  refresh: () => Promise<void>;
}

// key가 바뀌면 다시 불러오고, 늦게 도착한 이전 응답은 버린다.
function useLoader<T>(key: string, load: () => Promise<T>, empty: T): Loaded<T> {
  const [state, setState] = useState<{ key: string; status: LoadStatus; data: T }>({ key, status: 'loading', data: empty });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const data = await load();
      setState({ key, status: 'ready', data });
    } catch {
      setState({ key, status: 'error', data: empty });
    }
    // load는 key에 모든 입력이 담겨 있으므로 key로만 갱신한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    let active = true;
    load()
      .then((data) => {
        if (active) setState({ key, status: 'ready', data });
      })
      .catch(() => {
        if (active) setState({ key, status: 'error', data: empty });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // key가 막 바뀐 첫 렌더에서는 이전 key의 데이터를 보여주지 않는다.
  if (state.key !== key) return { status: 'loading', data: empty, refresh };
  return { status: state.status, data: state.data, refresh };
}

export interface DayTimelineData {
  reservations: ReservationView[];
  events: ClubEventView[];
}

const EMPTY_DAY: DayTimelineData = { reservations: [], events: [] };
const EMPTY_DAYS = new Set<string>();

export function useDayTimeline(dayKey: string, version = 0): Loaded<DayTimelineData> {
  return useLoader(`${dayKey}#${version}`, async () => {
    const [from, to] = dayRange(dayKey);
    const [reservations, events] = await Promise.all([fetchDayReservations(dayKey), fetchEventsBetween(from, to)]);
    return { reservations, events };
  }, EMPTY_DAY);
}

// monthKey: YYYY-MM-01
export function useMonthEventDays(monthKey: string, version = 0): Loaded<Set<string>> {
  return useLoader(`${monthKey}#${version}`, async () => {
    const events = await fetchEventsBetween(kstInstant(monthKey), kstInstant(addMonths(monthKey, 1)));
    return eventDaysInMonth(monthKey, events);
  }, EMPTY_DAYS);
}

export function useUpcomingEvent(): Loaded<ClubEventView | null> {
  return useLoader('upcoming', async () => {
    const now = new Date();
    return nextUpcomingEvent(await fetchUpcomingEventCandidates(now), now);
  }, null);
}
