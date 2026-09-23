import { useEffect, useState } from 'react';
import { Lock, Trash2, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../reservations/useOnlineStatus';
import { validationMessage } from '../reservations/messages';
import { TAG_LABELS, TAGS } from '../reservations/policy';
import {
  cancelReservation,
  createReservation,
  PastReservationError,
  ReservationNotFoundError,
  ReservationOwnershipError,
  ReservationValidationError,
  rescheduleReservation,
  SlotConflictError,
} from '../reservations/repository';
import type { ReservationView } from '../reservations/types';
import { createEvent, deleteEvent, updateEvent } from './eventRepository';
import { useMembers } from '../members/useMembers';
import { InviteePicker } from '../members/InviteePicker';
import { eventValidationMessage, EventValidationError } from './eventPolicy';
import {
  draftFromEventEntry,
  draftFromReservation,
  emptyEntryDraft,
  ENTRY_LIMITS,
  EntryValidationError,
  entryValidationMessage,
  planEntry,
  ROOM_START_TIMES,
  roomEndOptions,
  snapToRoom,
  type EntryDraft,
  type Place,
} from './entry';
import type { ClubEventView } from './types';

export type EntrySheetMode =
  | { kind: 'create'; dayKey: string }
  | { kind: 'edit-reservation'; reservation: ReservationView }
  | { kind: 'edit-event'; event: ClubEventView };

export interface EntrySheetProps {
  mode: EntrySheetMode;
  viewer: { uid: string; name: string };
  onClose: () => void;
  onSaved: (message: string) => void;
  onStale: () => void; // 슬롯 충돌 시 최신 목록을 다시 불러온다.
}

const PLACES: { value: Place; label: string }[] = [
  { value: 'room', label: '동아리방' },
  { value: 'other', label: '다른 장소' },
];

function initialDraft(mode: EntrySheetMode): EntryDraft {
  if (mode.kind === 'edit-reservation') return draftFromReservation(mode.reservation);
  if (mode.kind === 'edit-event') return draftFromEventEntry(mode.event);
  return emptyEntryDraft(mode.dayKey);
}

function errorMessage(error: unknown): string {
  if (error instanceof EntryValidationError) return entryValidationMessage(error.reason);
  if (error instanceof EventValidationError) return eventValidationMessage(error.reason);
  if (error instanceof ReservationValidationError) return validationMessage(error.reason);
  if (
    error instanceof SlotConflictError ||
    error instanceof PastReservationError ||
    error instanceof ReservationOwnershipError ||
    error instanceof ReservationNotFoundError
  ) {
    return error.message;
  }
  if ((error as { code?: string } | null)?.code === 'permission-denied') return '이 일정을 바꿀 권한이 없어요.';
  return '저장하지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.';
}

export function EntrySheet({ mode, viewer, onClose, onSaved, onStale }: EntrySheetProps) {
  const [draft, setDraft] = useState<EntryDraft>(() => initialDraft(mode));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const online = useOnlineStatus();
  const members = useMembers();
  const editing = mode.kind !== 'create';

  const locksRoom = draft.place === 'room' && !draft.allDay;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 동아리방 시간 지정일 때는 항상 30분 선택지 안의 값만 들고 있게 한다.
  function patch(next: Partial<EntryDraft>) {
    setDraft((current) => {
      const merged = { ...current, ...next };
      return merged.place === 'room' && !merged.allDay ? snapToRoom(merged) : merged;
    });
    setMessage(null);
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      onSaved(success);
    } catch (error) {
      setMessage(errorMessage(error));
      setConfirmingDelete(false);
      if (error instanceof SlotConflictError) onStale();
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const plan = planEntry(draft);
    if (mode.kind === 'create') {
      if (plan.kind === 'reservation') {
        await createReservation({ draft: plan.draft, ownerId: viewer.uid, ownerName: viewer.name });
      } else {
        await createEvent(plan.draft, viewer.uid);
      }
      return;
    }
    const expected = mode.kind === 'edit-reservation' ? 'reservation' : 'event';
    if (plan.kind !== expected) throw new EntryValidationError('kind-change');
    if (mode.kind === 'edit-reservation' && plan.kind === 'reservation') {
      await rescheduleReservation({ reservationId: mode.reservation.id, viewerId: viewer.uid, draft: plan.draft });
    } else if (mode.kind === 'edit-event' && plan.kind === 'event') {
      await updateEvent(mode.event.id, plan.draft, viewer.uid);
    }
  }

  function handleDelete() {
    if (mode.kind === 'edit-reservation') {
      void run(() => cancelReservation({ reservationId: mode.reservation.id, viewerId: viewer.uid }), '일정을 삭제했어요.');
    } else if (mode.kind === 'edit-event') {
      void run(() => deleteEvent(mode.event.id), '일정을 삭제했어요.');
    }
  }

  const disabled = busy || !online;
  const heading = editing ? '일정 수정' : '일정 추가';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">SCHEDULE</p>
            <h2>{heading}</h2>
          </div>
          <button type="button" className="round-button" aria-label="닫기" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="modal-body">
          <form
            className="reserve-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(save, editing ? '일정을 수정했어요.' : '일정을 추가했어요.');
            }}
          >
            <label className="field-block">
              <span>제목</span>
              <input
                type="text"
                value={draft.title}
                maxLength={ENTRY_LIMITS.titleMax}
                placeholder="예: 보컬 합주"
                onChange={(event) => patch({ title: event.target.value })}
              />
            </label>

            <div className="field-block">
              <span id="entry-tag-label">태그</span>
              <div className="tag-toggle" role="group" aria-labelledby="entry-tag-label">
                {TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="filter-chip"
                    aria-pressed={draft.tag === tag}
                    onClick={() => patch({ tag })}
                  >
                    {TAG_LABELS[tag]}
                  </button>
                ))}
              </div>
            </div>

            {draft.tag === 'jam' && (
              <>
                <InviteePicker
                  members={members.members}
                  status={members.status}
                  selected={draft.participantIds}
                  currentUserId={viewer.uid}
                  onChange={(participantIds) => patch({ participantIds })}
                />
                <p className="field-hint">초대하면 바로 참여자가 되고 알림이 가요. 합주 1시간 전에도 함께 알려드려요.</p>
              </>
            )}

            <div className="field-block">
              <span id="entry-place-label">장소</span>
              <div className="place-toggle" role="group" aria-labelledby="entry-place-label">
                {PLACES.map((place) => (
                  <button
                    key={place.value}
                    type="button"
                    className="filter-chip"
                    aria-pressed={draft.place === place.value}
                    onClick={() => patch({ place: place.value })}
                  >
                    {place.label}
                  </button>
                ))}
              </div>
              {draft.place === 'other' && (
                <input
                  type="text"
                  aria-label="장소 이름 (선택)"
                  value={draft.location}
                  maxLength={60}
                  placeholder="예: 대강당"
                  onChange={(event) => patch({ location: event.target.value })}
                />
              )}
              <p className="field-hint">
                {locksRoom ? (
                  <>
                    <Lock size={13} aria-hidden="true" />
                    {draft.tag === 'jam'
                      ? ' 합주는 30분 단위로 최대 1시간. 다른 일정과 시간이 겹치지 않게 잡아둬요.'
                      : ' 30분 단위로 09:00–24:00 안에서 원하는 만큼. 다른 일정과 시간이 겹치지 않게 잡아둬요.'}
                  </>
                ) : draft.place === 'room' ? (
                  '종일 일정은 동아리방 시간을 잡아두지 않아요.'
                ) : (
                  '동아리방 시간은 잡아두지 않아요.'
                )}
              </p>
            </div>

            <label className="check-row">
              <input type="checkbox" checked={draft.allDay} onChange={(event) => patch({ allDay: event.target.checked })} />
              <span>종일</span>
            </label>

            {locksRoom ? (
              <>
                <label className="field-block">
                  <span>날짜</span>
                  <input type="date" value={draft.startDate} onChange={(event) => patch({ startDate: event.target.value })} />
                </label>
                <div className="field-pair">
                  <label className="field-block">
                    <span>시작 시각</span>
                    <select value={draft.startTime} onChange={(event) => patch({ startTime: event.target.value })}>
                      {ROOM_START_TIMES.map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-block">
                    <span>종료 시각</span>
                    <select value={draft.endTime} onChange={(event) => patch({ endTime: event.target.value })}>
                      {roomEndOptions(draft.startTime, draft.tag).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <>
                <div className="field-pair">
                  <label className="field-block">
                    <span>{draft.allDay ? '날짜' : '시작 날짜'}</span>
                    <input type="date" value={draft.startDate} onChange={(event) => patch({ startDate: event.target.value, endDate: event.target.value })} />
                  </label>
                  {!draft.allDay && (
                    <label className="field-block">
                      <span>시작 시각</span>
                      <input type="time" value={draft.startTime} onChange={(event) => patch({ startTime: event.target.value })} />
                    </label>
                  )}
                </div>

                {!draft.allDay && (
                  <div className="field-pair">
                    <label className="field-block">
                      <span>종료 날짜</span>
                      <input type="date" value={draft.endDate} onChange={(event) => patch({ endDate: event.target.value })} />
                    </label>
                    <label className="field-block">
                      <span>종료 시각 (비우면 없음)</span>
                      <input type="time" value={draft.endTime} onChange={(event) => patch({ endTime: event.target.value })} />
                    </label>
                  </div>
                )}
              </>
            )}

            <label className="field-block">
              <span>설명 (선택)</span>
              <textarea
                value={draft.description}
                maxLength={ENTRY_LIMITS.descriptionMax}
                rows={3}
                placeholder="준비물이나 공지를 적어두세요."
                onChange={(event) => patch({ description: event.target.value })}
              />
            </label>

            {message && <p className="form-message" role="status" data-tone="error">{message}</p>}

            <div className="reserve-cta" role="group" aria-label={`${heading} 확정`}>
              {!online && (
                <p className="offline-note"><WifiOff size={15} aria-hidden="true" /> 오프라인 상태에서는 저장할 수 없어요.</p>
              )}
              {confirmingDelete ? (
                <div className="confirm-row">
                  <p>이 일정을 삭제할까요? 되돌릴 수 없어요.</p>
                  <button type="button" className="danger-button" disabled={disabled} onClick={handleDelete}>
                    {busy ? '삭제하고 있어요' : '삭제 확정'}
                  </button>
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmingDelete(false)}>
                    취소
                  </button>
                </div>
              ) : (
                <div className="cta-actions">
                  {editing && (
                    <button type="button" className="secondary-button" disabled={disabled} onClick={() => setConfirmingDelete(true)}>
                      <Trash2 size={17} aria-hidden="true" /> 삭제
                    </button>
                  )}
                  <button type="submit" className="primary-button" disabled={disabled}>
                    {busy ? '저장하고 있어요' : '저장'}
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
