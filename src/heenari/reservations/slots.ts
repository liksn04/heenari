// 실행 환경 시간대에 의존하지 않고 Asia/Seoul(+09:00) 기준으로만 슬롯 시각을 다룬다.
// 서울은 DST가 없으므로 UTC 인스턴트에 +9시간을 더해 벽시계 값을 읽는다.

export const SLOT_MINUTES = 30;
export const OPENING_MINUTE = 0; // 00:00 — 새벽을 포함한 하루 전체 예약 가능
export const CLOSING_MINUTE = 24 * 60; // 24:00
export const SLOTS_PER_DAY = (CLOSING_MINUTE - OPENING_MINUTE) / SLOT_MINUTES; // 48
export const SEOUL_OFFSET = '+09:00';
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

interface SeoulParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function seoulParts(date: Date): SeoulParts {
  const shifted = new Date(date.getTime() + SEOUL_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function dayKeyOf(date: Date): string {
  const { year, month, day } = seoulParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function slotStartAtToId(date: Date): string {
  const { year, month, day, hour, minute } = seoulParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}_${pad2(hour)}-${pad2(minute)}`;
}

export interface SlotParts {
  dayKey: string;
  hour: number;
  minute: number;
  minuteOfDay: number;
  label: string;
}

export function parseSlotId(slotId: string): SlotParts {
  const [dayKey, timePart] = slotId.split('_');
  const [hourText, minuteText] = timePart.split('-');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return {
    dayKey,
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
    label: `${pad2(hour)}:${pad2(minute)}`,
  };
}

export function slotLabelOf(slotId: string): string {
  return parseSlotId(slotId).label;
}

export function slotIdToStartAt(slotId: string): Date {
  const { dayKey, hour, minute } = parseSlotId(slotId);
  return new Date(`${dayKey}T${pad2(hour)}:${pad2(minute)}:00.000${SEOUL_OFFSET}`);
}

export function generateSlotIds(dayKey: string): string[] {
  const ids: string[] = [];
  for (let minute = OPENING_MINUTE; minute < CLOSING_MINUTE; minute += SLOT_MINUTES) {
    const hour = Math.floor(minute / 60);
    const min = minute % 60;
    ids.push(`${dayKey}_${pad2(hour)}-${pad2(min)}`);
  }
  return ids;
}

export function addBookingDays(dayKey: string, days: number): string {
  const base = new Date(`${dayKey}T00:00:00.000${SEOUL_OFFSET}`);
  return dayKeyOf(new Date(base.getTime() + days * 24 * 60 * 60 * 1000));
}

export function timeLabelOf(date: Date): string {
  return slotLabelOf(slotStartAtToId(date));
}
