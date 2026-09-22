import { useEffect } from 'react';
import { X } from 'lucide-react';
import { ReservationForm, type ReservationViewer } from './ReservationForm';

export function ReservationModal({
  viewer,
  dayKey,
  onClose,
  onCreated,
}: {
  viewer: ReservationViewer;
  dayKey: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${dayKey} 예약`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">30 MINUTE SLOT</p>
            <h2>{dayKey}</h2>
          </div>
          <button type="button" className="round-button" aria-label="닫기" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="modal-body">
          <ReservationForm viewer={viewer} dayKey={dayKey} onCreated={onCreated} />
        </div>
      </div>
    </div>
  );
}
