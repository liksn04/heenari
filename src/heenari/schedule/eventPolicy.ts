import { dayKeyOf, SEOUL_OFFSET, timeLabelOf } from '../reservations/slots';
import type { ClubEventView, EventDraft, EventInput } from './types';

// 고정 제품 정책. firestore.rules의 eventShape와 같은 값을 쓴다.
export const EVENT_POLICY = {
  titleMax: 60,
  descriptionMax: 500,
  locationMax: 60,
  maxDurationHours: 72,
} as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const MAX_EVENT_DURATION_MS = EVENT_POLICY.maxDurationHours * HOUR_MS;

export type EventDraftError = 'title' | 'description' | 'location' | 'start' | 'end' | 'end-order' | 'too-long';

export class EventValidationError extends Error {
  readonly reason: EventDraftError;
  constructor(reason: EventDraftError) {
    super(reason);
    this.name = 'EventValidationError';
    this.reason = reason;
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

// 실행 환경 시간대와 무관하게 KST 벽시계 값을 인스턴트로 바꾼다.
export function kstInstant(dayKey: string, time = '00:00'): Date {
  return new Date(`${dayKey}T${time}:00.000${SEOUL_OFFSET}`);
}

export function parseInstant(dayKey: string, time: string): Date | null {
  if (!DATE_PATTERN.test(dayKey) || !TIME_PATTERN.test(time)) return null;
  const instant = kstInstant(dayKey, time);
  if (Number.isNaN(instant.getTime())) return null;
  // 2026-02-31 같은 값이 다음 달로 넘어가는 것을 막는다.
  if (dayKeyOf(instant) !== dayKey || timeLabelOf(instant) !== time) return null;
  return instant;
}

function optionalText(value: string, max: number, reason: EventDraftError): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) throw new EventValidationError(reason);
  return trimmed;
}

export function parseEventDraft(draft: EventDraft): EventInput {
  const title = draft.title.trim();
  if (title.length < 1 || title.length > EVENT_POLICY.titleMax) throw new EventValidationError('title');
  const description = optionalText(draft.description, EVENT_POLICY.descriptionMax, 'description');
  const location = optionalText(draft.location, EVENT_POLICY.locationMax, 'location');

  if (draft.allDay) {
    const startAt = parseInstant(draft.startDate, '00:00');
    if (!startAt) throw new EventValidationError('start');
    return { title, description, location, allDay: true, tag: draft.tag, startAt, endAt: null };
  }

  const startAt = parseInstant(draft.startDate, draft.startTime);
  if (!startAt) throw new EventValidationError('start');
  if (draft.endTime === '') return { title, description, location, allDay: false, tag: draft.tag, startAt, endAt: null };

  const endAt = parseInstant(draft.endDate === '' ? draft.startDate : draft.endDate, draft.endTime);
  if (!endAt) throw new EventValidationError('end');
  if (endAt.getTime() <= startAt.getTime()) throw new EventValidationError('end-order');
  if (endAt.getTime() - startAt.getTime() > MAX_EVENT_DURATION_MS) throw new EventValidationError('too-long');
  return { title, description, location, allDay: false, tag: draft.tag, startAt, endAt };
}

export function emptyEventDraft(dayKey: string): EventDraft {
  return {
    title: '',
    description: '',
    location: '',
    allDay: false,
    tag: 'etc',
    startDate: dayKey,
    startTime: '18:00',
    endDate: dayKey,
    endTime: '20:00',
  };
}

export function draftFromEvent(event: ClubEventView): EventDraft {
  const startDate = dayKeyOf(event.startAt);
  return {
    title: event.title,
    description: event.description ?? '',
    location: event.location ?? '',
    allDay: event.allDay,
    tag: event.tag ?? 'etc',
    startDate,
    startTime: event.allDay ? '18:00' : timeLabelOf(event.startAt),
    endDate: event.endAt ? dayKeyOf(event.endAt) : startDate,
    endTime: event.endAt ? timeLabelOf(event.endAt) : '',
  };
}

// 종일 일정은 그날 24:00까지, 종료 없는 일정은 시작 순간에 끝난 것으로 본다.
export function eventEffectiveEnd(event: ClubEventView): Date {
  if (event.allDay) return new Date(event.startAt.getTime() + DAY_MS);
  return event.endAt ?? event.startAt;
}

// [from, to)와 일정 기간이 겹치는가. 종료 없는 일정은 시작 순간 하나로 판정한다.
export function eventOverlaps(event: ClubEventView, from: Date, to: Date): boolean {
  const start = event.startAt.getTime();
  const end = eventEffectiveEnd(event).getTime();
  if (end === start) return start >= from.getTime() && start < to.getTime();
  return start < to.getTime() && end > from.getTime();
}

export function eventDayKeys(event: ClubEventView): string[] {
  const start = event.startAt.getTime();
  const end = eventEffectiveEnd(event).getTime();
  const lastKey = dayKeyOf(new Date(Math.max(start, end - 1)));
  const keys = [dayKeyOf(event.startAt)];
  let cursor = kstInstant(keys[0]).getTime() + DAY_MS;
  while (keys[keys.length - 1] < lastKey) {
    keys.push(dayKeyOf(new Date(cursor)));
    cursor += DAY_MS;
  }
  return keys;
}

function shortDate(date: Date): string {
  const [, month, day] = dayKeyOf(date).split('-').map(Number);
  return `${month}/${day}`;
}

// 시작일과 종료일이 다른 시간 일정. 표시 범위에 날짜가 함께 들어간다.
export function spansMultipleDays(event: ClubEventView): boolean {
  return !event.allDay && event.endAt !== null && dayKeyOf(event.startAt) !== dayKeyOf(event.endAt);
}

export function formatEventRange(event: ClubEventView): string {
  if (event.allDay) return '종일';
  const start = timeLabelOf(event.startAt);
  if (!event.endAt) return start;
  if (!spansMultipleDays(event)) return `${start}–${timeLabelOf(event.endAt)}`;
  return `${shortDate(event.startAt)} ${start} – ${shortDate(event.endAt)} ${timeLabelOf(event.endAt)}`;
}

export function eventValidationMessage(reason: EventDraftError): string {
  switch (reason) {
    case 'title':
      return `제목을 1~${EVENT_POLICY.titleMax}자로 입력해주세요.`;
    case 'description':
      return `설명은 ${EVENT_POLICY.descriptionMax}자 이하로 입력해주세요.`;
    case 'location':
      return `장소는 ${EVENT_POLICY.locationMax}자 이하로 입력해주세요.`;
    case 'start':
      return '시작 날짜와 시각을 확인해주세요.';
    case 'end':
      return '종료 날짜와 시각을 확인해주세요.';
    case 'end-order':
      return '종료는 시작보다 늦어야 해요.';
    case 'too-long':
      return `일정은 최대 ${EVENT_POLICY.maxDurationHours}시간까지 등록할 수 있어요.`;
  }
}
