import { generateSlotIds, slotIdToStartAt, slotLabelOf } from './slots';
import type { DaySlotView, SlotStatus } from './types';

export interface DayReservationSummary {
  id: string;
  ownerId: string;
  slotIds: string[];
}

// 예약 목록을 하루의 30분 슬롯 뷰로 투영한다. 색상 외 텍스트 상태를 위해 status를 명시한다.
export function buildDaySlots(
  dayKey: string,
  reservations: DayReservationSummary[],
  viewerId: string,
  now: Date = new Date(),
): DaySlotView[] {
  const bySlot = new Map<string, DayReservationSummary>();
  for (const reservation of reservations) {
    for (const slotId of reservation.slotIds) {
      bySlot.set(slotId, reservation);
    }
  }

  return generateSlotIds(dayKey).map((slotId) => {
    const taken = bySlot.get(slotId);
    let status: SlotStatus;
    let reservationId: string | null = null;

    if (taken) {
      reservationId = taken.id;
      status = taken.ownerId === viewerId ? 'mine' : 'reserved';
    } else if (slotIdToStartAt(slotId).getTime() <= now.getTime()) {
      status = 'past';
    } else {
      status = 'available';
    }

    return { slotId, label: slotLabelOf(slotId), status, reservationId };
  });
}
