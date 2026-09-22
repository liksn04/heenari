import { parseSlotId } from './slots';
import { RESERVATION_POLICY } from './policy';

// 선택은 항상 같은 날짜의 연속 범위다. minuteOfDay 배열로 정규화해 다룬다.
function sortByMinute(slotIds: string[]): string[] {
  return [...slotIds].sort((a, b) => parseSlotId(a).minuteOfDay - parseSlotId(b).minuteOfDay);
}

export function toggleSlot(selection: string[], slotId: string): string[] {
  if (selection.length === 0) return [slotId];

  const sorted = sortByMinute(selection);
  const dayKey = parseSlotId(sorted[0]).dayKey;
  const target = parseSlotId(slotId);

  // 다른 날짜: 새로 시작
  if (target.dayKey !== dayKey) return [slotId];

  const minutes = sorted.map((id) => parseSlotId(id).minuteOfDay);
  const min = minutes[0];
  const max = minutes[minutes.length - 1];
  const step = RESERVATION_POLICY.slotMinutes;
  const targetMinute = target.minuteOfDay;

  const isSelected = minutes.includes(targetMinute);
  if (isSelected) {
    if (selection.length === 1) return [];
    if (targetMinute === max) return sorted.slice(0, -1); // 위에서부터 축소
    if (targetMinute === min) return sorted.slice(1); // 아래에서부터 축소
    // 내부 슬롯: 해당 슬롯 아래 구간만 남긴다 (연속 보장).
    return sorted.filter((id) => parseSlotId(id).minuteOfDay < targetMinute);
  }

  const withinCap = selection.length < RESERVATION_POLICY.maxSlots;
  if (withinCap && targetMinute === max + step) return [...sorted, slotId];
  if (withinCap && targetMinute === min - step) return [slotId, ...sorted];

  // 비연속이거나 최대 길이 초과: 새로 시작
  return [slotId];
}

export interface SelectionSummary {
  startLabel: string;
  endLabel: string;
  count: number;
  minutes: number;
}

export function selectionSummary(slotIds: string[]): SelectionSummary | null {
  if (slotIds.length === 0) return null;
  const sorted = sortByMinute(slotIds);
  const first = parseSlotId(sorted[0]);
  const last = parseSlotId(sorted[sorted.length - 1]);
  const endMinute = last.minuteOfDay + RESERVATION_POLICY.slotMinutes;
  const endLabel = `${String(Math.floor(endMinute / 60)).padStart(2, '0')}:${String(endMinute % 60).padStart(2, '0')}`;
  return {
    startLabel: first.label,
    endLabel,
    count: sorted.length,
    minutes: sorted.length * RESERVATION_POLICY.slotMinutes,
  };
}
