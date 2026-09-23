import { addBookingDays, CLOSING_MINUTE, dayKeyOf, OPENING_MINUTE, SLOT_MINUTES, timeLabelOf } from '../reservations/slots';
import { maxSlotsFor, RESERVATION_POLICY, type Tag } from '../reservations/policy';
import type { ReservationDraft, ReservationView } from '../reservations/types';
import {
  draftFromEvent,
  EventValidationError,
  eventValidationMessage,
  parseEventDraft,
  parseInstant,
  type EventDraftError,
} from './eventPolicy';
import type { ClubEventView, EventDraft } from './types';

// 예약과 일정을 한 모달로 입력한다. 장소가 동아리방이고 시간을 지정하면 30분 슬롯을
// 잠그는 예약으로, 그 밖(다른 장소·종일·여러 날)은 잠그지 않는 일정으로 저장한다.

export const ROOM_NAME = '동아리방';

export type Place = 'room' | 'other';

// location은 place가 'other'일 때만 쓴다.
export interface EntryDraft extends EventDraft {
  place: Place;
}

export type EntryPlan =
  | { kind: 'reservation'; draft: ReservationDraft }
  | { kind: 'event'; draft: EventDraft };

export type EntryDraftError = EventDraftError | 'room-end' | 'room-span' | 'room-hours' | 'jam-too-long' | 'kind-change';

export class EntryValidationError extends Error {
  readonly reason: EntryDraftError;
  constructor(reason: EntryDraftError) {
    super(reason);
    this.name = 'EntryValidationError';
    this.reason = reason;
  }
}

// 예약 문서 한도(제목 40, 메모 200)가 더 좁으므로 모든 항목에 같은 한도를 쓴다.
export const ENTRY_LIMITS = {
  titleMax: RESERVATION_POLICY.titleMax,
  descriptionMax: RESERVATION_POLICY.noteMax,
} as const;

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function minuteOf(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function roomSlotIds(draft: EntryDraft): string[] {
  if (!parseInstant(draft.startDate, draft.startTime)) throw new EntryValidationError('start');
  if (draft.endTime === '') throw new EntryValidationError('room-end');
  const endDate = draft.endDate === '' ? draft.startDate : draft.endDate;
  if (!parseInstant(endDate, draft.endTime)) throw new EntryValidationError('end');

  const start = minuteOf(draft.startTime);
  let end = minuteOf(draft.endTime);
  const nextDay = addBookingDays(draft.startDate, 1);
  if (draft.endTime === '00:00' && (endDate === draft.startDate || endDate === nextDay)) {
    end = CLOSING_MINUTE; // 24:00
  } else if (endDate !== draft.startDate) {
    throw new EntryValidationError('room-span');
  }

  if (start % SLOT_MINUTES !== 0 || end % SLOT_MINUTES !== 0 || start < OPENING_MINUTE || end > CLOSING_MINUTE) {
    throw new EntryValidationError('room-hours');
  }
  if (end <= start) throw new EntryValidationError('end-order');
  if ((end - start) / SLOT_MINUTES > maxSlotsFor(draft.tag)) throw new EntryValidationError('jam-too-long');

  const ids: string[] = [];
  for (let minute = start; minute < end; minute += SLOT_MINUTES) {
    ids.push(`${draft.startDate}_${pad2(Math.floor(minute / 60))}-${pad2(minute % 60)}`);
  }
  return ids;
}

function formatMinute(minute: number): string {
  return `${pad2(Math.floor(minute / 60) % 24)}:${pad2(minute % 60)}`;
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

function maxRoomMinutes(tag: Tag): number {
  return maxSlotsFor(tag) * SLOT_MINUTES;
}

// 동아리방 시작 선택지: 09:00–23:30, 30분 간격.
export const ROOM_START_TIMES: string[] = Array.from(
  { length: (CLOSING_MINUTE - OPENING_MINUTE) / SLOT_MINUTES },
  (_, index) => formatMinute(OPENING_MINUTE + index * SLOT_MINUTES),
);

export interface TimeOption {
  value: string; // 24:00은 '00:00'으로 저장한다(roomSlotIds가 그날 24:00으로 해석).
  label: string;
}

// 동아리방 종료 선택지: 시작 30분 뒤부터 24:00까지. 합주만 최대 1시간.
export function roomEndOptions(startTime: string, tag: Tag): TimeOption[] {
  const start = minuteOf(startTime);
  const last = Math.min(start + maxRoomMinutes(tag), CLOSING_MINUTE);
  const options: TimeOption[] = [];
  for (let end = start + SLOT_MINUTES; end <= last; end += SLOT_MINUTES) {
    const time = end === CLOSING_MINUTE ? '24:00' : formatMinute(end);
    options.push({ value: formatMinute(end), label: `${time} (${durationLabel(end - start)})` });
  }
  return options;
}

// 동아리방 시간 지정 모드로 바뀌거나 시작이 바뀌면 값을 선택지 안으로 맞춘다. 유효한 값은 그대로 둔다.
export function snapToRoom(draft: EntryDraft): EntryDraft {
  const rawStart = /^\d{2}:\d{2}$/.test(draft.startTime) ? minuteOf(draft.startTime) : 18 * 60;
  const start = Math.min(
    Math.max(Math.floor(rawStart / SLOT_MINUTES) * SLOT_MINUTES, OPENING_MINUTE),
    CLOSING_MINUTE - SLOT_MINUTES,
  );
  let end: number | null = null;
  if (/^\d{2}:\d{2}$/.test(draft.endTime)) {
    const raw = draft.endTime === '00:00' ? CLOSING_MINUTE : minuteOf(draft.endTime);
    end = Math.ceil(raw / SLOT_MINUTES) * SLOT_MINUTES;
  }
  if (end === null || end <= start || end - start > maxRoomMinutes(draft.tag) || end > CLOSING_MINUTE) {
    end = Math.min(start + Math.min(60, maxRoomMinutes(draft.tag)), CLOSING_MINUTE);
  }
  return { ...draft, startTime: formatMinute(start), endTime: formatMinute(end), endDate: draft.startDate };
}

export function planEntry(draft: EntryDraft): EntryPlan {
  const title = draft.title.trim();
  if (title.length < 1 || title.length > ENTRY_LIMITS.titleMax) throw new EntryValidationError('title');
  const description = draft.description.trim();
  if (description.length > ENTRY_LIMITS.descriptionMax) throw new EntryValidationError('description');
  // 초대는 합주에만. 다른 태그로 바꾸면 고른 회원은 저장하지 않는다.
  const participantIds = draft.tag === 'jam' ? draft.participantIds : [];

  if (draft.place === 'room' && !draft.allDay) {
    return {
      kind: 'reservation',
      draft: { title, note: description === '' ? null : description, tag: draft.tag, participantIds, slotIds: roomSlotIds(draft) },
    };
  }

  const { place, ...rest } = draft;
  const eventDraft: EventDraft = { ...rest, participantIds, location: place === 'room' ? ROOM_NAME : draft.location };
  try {
    parseEventDraft(eventDraft);
  } catch (error) {
    if (error instanceof EventValidationError) throw new EntryValidationError(error.reason);
    throw error;
  }
  return { kind: 'event', draft: eventDraft };
}

export function emptyEntryDraft(dayKey: string): EntryDraft {
  return {
    title: '',
    description: '',
    location: '',
    place: 'room',
    allDay: false,
    tag: 'jam',
    participantIds: [],
    startDate: dayKey,
    startTime: '18:00',
    endDate: dayKey,
    endTime: '19:00',
  };
}

export function draftFromReservation(reservation: ReservationView): EntryDraft {
  return {
    title: reservation.title,
    description: reservation.note ?? '',
    location: '',
    place: 'room',
    allDay: false,
    tag: reservation.tag ?? 'etc',
    participantIds: reservation.participantIds,
    startDate: reservation.dayKey,
    startTime: timeLabelOf(reservation.startAt),
    endDate: dayKeyOf(reservation.endAt),
    endTime: timeLabelOf(reservation.endAt),
  };
}

// 시간 지정 '동아리방' 일정은 슬롯을 잠그지 않았던 일정이므로 다른 장소로 되돌려 종류가 바뀌지 않게 한다.
export function draftFromEventEntry(event: ClubEventView): EntryDraft {
  const base = draftFromEvent(event);
  const room = event.allDay && event.location === ROOM_NAME;
  return { ...base, place: room ? 'room' : 'other', location: room ? '' : base.location };
}

export function entryValidationMessage(reason: EntryDraftError): string {
  switch (reason) {
    case 'title':
      return `제목을 1~${ENTRY_LIMITS.titleMax}자로 입력해주세요.`;
    case 'description':
      return `설명은 ${ENTRY_LIMITS.descriptionMax}자 이하로 입력해주세요.`;
    case 'room-end':
      return '동아리방 예약은 종료 시각이 필요해요.';
    case 'room-span':
      return '동아리방 예약은 하루 안에서만 할 수 있어요. 여러 날 일정은 다른 장소로 등록해주세요.';
    case 'room-hours':
      return '동아리방은 09:00–24:00 사이 30분 단위로 예약할 수 있어요.';
    case 'jam-too-long':
      return '합주는 한 번에 최대 1시간까지 예약할 수 있어요.';
    case 'kind-change':
      return '동아리방 시간 예약 여부는 바꿀 수 없어요. 삭제 후 다시 추가해주세요.';
    default:
      return eventValidationMessage(reason);
  }
}
