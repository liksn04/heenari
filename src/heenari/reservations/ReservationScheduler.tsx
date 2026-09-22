import { useState } from 'react';
import { ReservationCalendar } from './ReservationCalendar';
import { ReservationModal } from './ReservationModal';
import type { ReservationViewer } from './ReservationForm';

export function ReservationScheduler({ viewer }: { viewer: ReservationViewer }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmedDay, setConfirmedDay] = useState<string | null>(null);

  return (
    <div className="page-stack reserve-page">
      <section className="page-title">
        <p className="eyebrow">RESERVE</p>
        <h1>공간 예약</h1>
        <p>날짜를 고르고 예약하기를 누르면 30분 단위로 예약할 수 있어요.</p>
      </section>

      <ReservationCalendar
        selected={selected}
        onSelect={(dayKey) => {
          setSelected(dayKey);
          setConfirmedDay(null);
        }}
      />

      {confirmedDay && (
        <p className="form-message" role="status" data-tone="success">{confirmedDay} 예약이 확정됐어요.</p>
      )}

      <button
        type="button"
        className="primary-button reserve-open"
        disabled={!selected}
        onClick={() => setOpen(true)}
      >
        {selected ? `${selected} 예약하기` : '날짜를 선택하세요'}
      </button>

      {open && selected && (
        <ReservationModal
          viewer={viewer}
          dayKey={selected}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            setConfirmedDay(selected);
          }}
        />
      )}
    </div>
  );
}
