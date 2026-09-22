import { useCallback, useEffect, useState } from 'react';
import { buildDaySlots } from './daySlots';
import { fetchDayReservations } from './repository';
import type { DaySlotView, ReservationView } from './types';

export type DayReservationsStatus = 'loading' | 'ready' | 'error';

export interface DayReservationsState {
  status: DayReservationsStatus;
  reservations: ReservationView[];
  slots: DaySlotView[];
  error: string | null;
}

export interface UseDayReservations extends DayReservationsState {
  refresh: () => Promise<void>;
}

function readyState(dayKey: string, reservations: ReservationView[], viewerId: string): DayReservationsState {
  return { status: 'ready', reservations, slots: buildDaySlots(dayKey, reservations, viewerId), error: null };
}

function errorState(dayKey: string, viewerId: string): DayReservationsState {
  return {
    status: 'error',
    reservations: [],
    slots: buildDaySlots(dayKey, [], viewerId),
    error: '예약 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
  };
}

export function useDayReservations(dayKey: string, viewerId: string): UseDayReservations {
  const [state, setState] = useState<DayReservationsState>(() => ({
    status: 'loading',
    reservations: [],
    slots: buildDaySlots(dayKey, [], viewerId),
    error: null,
  }));

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }));
    try {
      const reservations = await fetchDayReservations(dayKey);
      setState(readyState(dayKey, reservations, viewerId));
    } catch {
      setState(errorState(dayKey, viewerId));
    }
  }, [dayKey, viewerId]);

  useEffect(() => {
    let active = true;
    fetchDayReservations(dayKey)
      .then((reservations) => {
        if (active) setState(readyState(dayKey, reservations, viewerId));
      })
      .catch(() => {
        if (active) setState(errorState(dayKey, viewerId));
      });
    return () => {
      active = false;
    };
  }, [dayKey, viewerId]);

  return { ...state, refresh };
}
