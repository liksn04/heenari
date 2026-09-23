import { useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { timeLabelOf } from './slots';
import { useMyUpcomingReservations } from './useMyUpcomingReservations';
import { cancelReservation } from './repository';

export function ReservationList({ viewer }: { viewer: { uid: string } }) {
  const { status, reservations, refresh } = useMyUpcomingReservations(viewer.uid);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setBusyId(id);
    setMessage(null);
    try {
      await cancelReservation({ reservationId: id, viewerId: viewer.uid });
      await refresh();
    } catch {
      setMessage('예약을 취소하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusyId(null);
    }
  }

  if (status === 'loading') {
    return <p className="muted-line"><Loader2 size={15} aria-hidden="true" /> 예약을 불러오고 있어요…</p>;
  }

  if (status === 'error') {
    return (
      <p className="form-message" role="status" data-tone="error">
        예약을 불러오지 못했어요.
        <button type="button" className="link-button" onClick={() => void refresh()}>다시 시도</button>
      </p>
    );
  }

  if (reservations.length === 0) {
    return (
      <div className="empty-state compact-empty">
        <CalendarClock size={22} aria-hidden="true" />
        <div>
          <strong>잡아둔 동아리방 시간이 없어요</strong>
          <p>일정에서 장소를 동아리방으로 두면 30분 단위로 잡아둘 수 있어요.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {message && <p className="form-message" role="status" data-tone="error">{message}</p>}
      <ul className="reservation-list" aria-label="내 동아리방 시간">
        {reservations.map((reservation) => (
          <li key={reservation.id} className="reservation-item">
            <div className="reservation-info">
              <p className="reservation-time">
                {reservation.dayKey} · {timeLabelOf(reservation.startAt)}–{timeLabelOf(reservation.endAt)}
              </p>
              <strong>{reservation.title}</strong>
            </div>
            <button
              type="button"
              className="secondary-button compact"
              disabled={busyId === reservation.id}
              onClick={() => void handleCancel(reservation.id)}
            >
              {busyId === reservation.id ? '취소 중…' : '취소'}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
