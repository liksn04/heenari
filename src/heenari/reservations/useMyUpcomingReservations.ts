import { useCallback, useEffect, useState } from 'react';
import { fetchMyUpcomingReservations } from './repository';
import type { ReservationView } from './types';

export type UpcomingStatus = 'loading' | 'ready' | 'error';

export interface UseMyUpcomingReservations {
  status: UpcomingStatus;
  reservations: ReservationView[];
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMyUpcomingReservations(viewerId: string): UseMyUpcomingReservations {
  const [status, setStatus] = useState<UpcomingStatus>('loading');
  const [reservations, setReservations] = useState<ReservationView[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const next = await fetchMyUpcomingReservations(viewerId);
      setReservations(next);
      setStatus('ready');
    } catch {
      setReservations([]);
      setError('예약을 불러오지 못했어요.');
      setStatus('error');
    }
  }, [viewerId]);

  useEffect(() => {
    let active = true;
    fetchMyUpcomingReservations(viewerId)
      .then((next) => {
        if (!active) return;
        setReservations(next);
        setStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setReservations([]);
        setError('예약을 불러오지 못했어요.');
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [viewerId]);

  return { status, reservations, error, refresh };
}
