import {
  addBookingDays,
  CLOSING_MINUTE,
  dayKeyOf,
  OPENING_MINUTE,
  parseSlotId,
  SEOUL_OFFSET,
  SLOT_MINUTES,
  slotIdToStartAt,
} from './slots';

// 태그: 합주·강습·기타. 합주만 길이 제한(1시간)이 있다. firestore.rules의 validTag와 같은 값.
export const TAGS = ['jam', 'lesson', 'etc'] as const;
export type Tag = (typeof TAGS)[number];
export const TAG_LABELS: Record<Tag, string> = { jam: '합주', lesson: '강습', etc: '기타' };
export const JAM_MAX_SLOTS = 2; // 1시간

export function isTag(value: unknown): value is Tag {
  return typeof value === 'string' && (TAGS as readonly string[]).includes(value);
}

// 고정 제품 정책. Firestore Rules와 클라이언트가 같은 값을 공유하도록 테스트로 고정한다.
export const RESERVATION_POLICY = {
  slotMinutes: SLOT_MINUTES,
  openingMinute: OPENING_MINUTE,
  closingMinute: CLOSING_MINUTE,
  minSlots: 1,
  maxSlots: (CLOSING_MINUTE - OPENING_MINUTE) / SLOT_MINUTES, // 09:00–24:00 전체(30슬롯)
  bookingWindowDays: 60,
  timeZone: 'Asia/Seoul',
  timeZoneOffset: SEOUL_OFFSET,
  titleMax: 40,
  noteMax: 200,
  ownerNameMax: 60,
} as const;

export function maxSlotsFor(tag: Tag): number {
  return tag === 'jam' ? JAM_MAX_SLOTS : RESERVATION_POLICY.maxSlots;
}

export type SlotSelectionError =
  | 'empty'
  | 'too-many'
  | 'duplicate'
  | 'mixed-day'
  | 'not-contiguous';

export function isSlotAligned(slotId: string): boolean {
  const { minute, minuteOfDay } = parseSlotId(slotId);
  return (
    minute % RESERVATION_POLICY.slotMinutes === 0 &&
    minuteOfDay >= RESERVATION_POLICY.openingMinute &&
    minuteOfDay < RESERVATION_POLICY.closingMinute
  );
}

export function validateSlotSelection(slotIds: string[]): SlotSelectionError | null {
  if (slotIds.length === 0) return 'empty';
  if (slotIds.length > RESERVATION_POLICY.maxSlots) return 'too-many';
  if (new Set(slotIds).size !== slotIds.length) return 'duplicate';

  const parsed = slotIds.map(parseSlotId);
  const dayKey = parsed[0].dayKey;
  if (parsed.some((slot) => slot.dayKey !== dayKey)) return 'mixed-day';

  const minutes = parsed.map((slot) => slot.minuteOfDay).sort((a, b) => a - b);
  for (let index = 1; index < minutes.length; index += 1) {
    if (minutes[index] - minutes[index - 1] !== RESERVATION_POLICY.slotMinutes) {
      return 'not-contiguous';
    }
  }
  return null;
}

export interface ReservationWindow {
  startAt: Date;
  endAt: Date;
  dayKey: string;
}

export function reservationWindow(slotIds: string[]): ReservationWindow {
  const sorted = [...slotIds].sort(
    (a, b) => parseSlotId(a).minuteOfDay - parseSlotId(b).minuteOfDay,
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const startAt = slotIdToStartAt(first);
  const endAt = new Date(slotIdToStartAt(last).getTime() + RESERVATION_POLICY.slotMinutes * 60 * 1000);
  return { startAt, endAt, dayKey: parseSlotId(first).dayKey };
}

export function validateTitle(title: string): boolean {
  const trimmed = title.trim();
  return trimmed.length >= 1 && trimmed.length <= RESERVATION_POLICY.titleMax;
}

export function validateNote(note: string | null): boolean {
  if (note === null) return true;
  return note.length <= RESERVATION_POLICY.noteMax;
}

export function isBookableDay(dayKey: string, now: Date = new Date()): boolean {
  const todayKey = dayKeyOf(now);
  if (dayKey < todayKey) return false;
  const maxKey = addBookingDays(todayKey, RESERVATION_POLICY.bookingWindowDays);
  return dayKey <= maxKey;
}
