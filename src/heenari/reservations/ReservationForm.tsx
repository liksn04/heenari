import { useState } from 'react';
import { WifiOff } from 'lucide-react';
import { RESERVATION_POLICY } from './policy';
import { useDayReservations } from './useDayReservations';
import { selectionSummary, toggleSlot } from './selection';
import { useOnlineStatus } from './useOnlineStatus';
import { validationMessage } from './messages';
import {
  createReservation,
  ReservationValidationError,
  SlotConflictError,
} from './repository';
import type { DaySlotView } from './types';

export interface ReservationViewer {
  uid: string;
  name: string;
}

const STATUS_TEXT: Record<DaySlotView['status'], string> = {
  available: '예약 가능',
  mine: '내 예약',
  reserved: '예약됨',
  past: '지난 시간',
};

interface FormMessage {
  tone: 'error' | 'success';
  text: string;
}

export interface ReservationFormProps {
  viewer: ReservationViewer;
  dayKey: string;
  onCreated?: () => void;
}

export function ReservationForm({ viewer, dayKey, onCreated }: ReservationFormProps) {
  const { slots, status, refresh } = useDayReservations(dayKey, viewer.uid);
  const [selection, setSelection] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const online = useOnlineStatus();

  const summary = selectionSummary(selection);
  const selected = new Set(selection);
  const titleValid = title.trim().length >= 1 && title.trim().length <= RESERVATION_POLICY.titleMax;
  const canConfirm = Boolean(summary) && titleValid && online && !submitting;

  function handleSlot(slot: DaySlotView) {
    const selectable = slot.status === 'available' || selected.has(slot.slotId);
    if (!selectable) return;
    setSelection((prev) => toggleSlot(prev, slot.slotId));
    setMessage(null);
  }

  async function handleConfirm() {
    if (!canConfirm || !summary) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await createReservation({
        draft: { title, note: note.trim() === '' ? null : note, slotIds: selection },
        ownerId: viewer.uid,
        ownerName: viewer.name,
      });
      setSelection([]);
      setTitle('');
      setNote('');
      setMessage({ tone: 'success', text: '예약이 확정됐어요.' });
      await refresh();
      onCreated?.();
    } catch (error) {
      if (error instanceof SlotConflictError) {
        setMessage({ tone: 'error', text: error.message });
        await refresh(); // 선택은 보존하고 최신 슬롯 상태만 다시 불러온다.
      } else if (error instanceof ReservationValidationError) {
        setMessage({ tone: 'error', text: validationMessage(error.reason) });
      } else {
        setMessage({ tone: 'error', text: '예약을 확정하지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="reserve-form">
      <section aria-label="30분 슬롯" className="slot-grid">
        {status === 'error' && (
          <p className="form-message" role="status" data-tone="error">
            예약 정보를 불러오지 못했어요.
            <button type="button" className="link-button" onClick={() => void refresh()}>다시 시도</button>
          </p>
        )}
        {slots.map((slot) => {
          const isSelected = selected.has(slot.slotId);
          const disabled = !isSelected && slot.status !== 'available';
          return (
            <button
              key={slot.slotId}
              type="button"
              className="slot-cell"
              data-status={isSelected ? 'selected' : slot.status}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => handleSlot(slot)}
            >
              <span className="slot-time">{slot.label}</span>
              <small className="slot-state">{isSelected ? '선택함' : STATUS_TEXT[slot.status]}</small>
            </button>
          );
        })}
      </section>

      <label className="field-block">
        <span>예약 제목</span>
        <input
          type="text"
          value={title}
          maxLength={RESERVATION_POLICY.titleMax}
          placeholder="예: 보컬 연습"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <label className="field-block">
        <span>메모 (선택)</span>
        <textarea
          value={note}
          maxLength={RESERVATION_POLICY.noteMax}
          rows={2}
          placeholder="함께 준비할 내용을 적어두세요."
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      {message && (
        <p className="form-message" role="status" data-tone={message.tone}>{message.text}</p>
      )}

      <div className="reserve-cta" role="group" aria-label="예약 확정">
        {!online && (
          <p className="offline-note"><WifiOff size={15} aria-hidden="true" /> 오프라인 상태에서는 예약할 수 없어요.</p>
        )}
        <div className="cta-summary">
          {summary ? (
            <p>
              <strong>{dayKey}</strong>
              <span>{summary.startLabel}–{summary.endLabel}</span>
              <span>{summary.minutes}분</span>
            </p>
          ) : (
            <p className="cta-placeholder">예약할 30분 슬롯을 선택하세요.</p>
          )}
        </div>
        <button type="button" className="primary-button" disabled={!canConfirm} onClick={() => void handleConfirm()}>
          {submitting ? '예약하고 있어요' : '예약 확정'}
        </button>
      </div>
    </div>
  );
}
