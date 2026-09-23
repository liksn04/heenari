import { describe, expect, it } from 'vitest';
import { buildDaySlots } from './daySlots';

const dayKey = '2026-09-22';
// 모든 슬롯을 과거로 만들지 않도록 기준 시각을 새벽으로 둔다 (2026-09-22 00:00 KST).
const now = new Date('2026-09-21T15:00:00.000Z');

describe('buildDaySlots', () => {
  it('하루 전체 슬롯을 생성하고 라벨을 붙인다', () => {
    const slots = buildDaySlots(dayKey, [], 'me', now);
    expect(slots).toHaveLength(30);
    expect(slots[0]).toMatchObject({ slotId: '2026-09-22_09-00', label: '09:00', status: 'available', reservationId: null });
  });

  it('내 예약과 남의 예약을 구분한다', () => {
    const reservations = [
      { id: 'r1', ownerId: 'me', slotIds: ['2026-09-22_09-00', '2026-09-22_09-30'] },
      { id: 'r2', ownerId: 'other', slotIds: ['2026-09-22_10-00'] },
    ];
    const slots = buildDaySlots(dayKey, reservations, 'me', now);
    const byId = Object.fromEntries(slots.map((s) => [s.slotId, s]));

    expect(byId['2026-09-22_09-00']).toMatchObject({ status: 'mine', reservationId: 'r1' });
    expect(byId['2026-09-22_09-30']).toMatchObject({ status: 'mine', reservationId: 'r1' });
    expect(byId['2026-09-22_10-00']).toMatchObject({ status: 'reserved', reservationId: 'r2' });
    expect(byId['2026-09-22_10-30']).toMatchObject({ status: 'available', reservationId: null });
  });

  it('시작 시각이 지난 빈 슬롯은 past로 표시한다', () => {
    // 기준 시각 2026-09-22 12:15 KST → 12:00 이하 슬롯은 과거.
    const noon = new Date('2026-09-22T03:15:00.000Z');
    const slots = buildDaySlots(dayKey, [], 'me', noon);
    const byId = Object.fromEntries(slots.map((s) => [s.slotId, s]));

    expect(byId['2026-09-22_11-30'].status).toBe('past');
    expect(byId['2026-09-22_12-00'].status).toBe('past');
    expect(byId['2026-09-22_12-30'].status).toBe('available');
  });

  it('예약된 과거 슬롯은 past가 아니라 소유 상태를 유지한다', () => {
    const noon = new Date('2026-09-22T03:15:00.000Z');
    const reservations = [{ id: 'r1', ownerId: 'me', slotIds: ['2026-09-22_09-00'] }];
    const slots = buildDaySlots(dayKey, reservations, 'me', noon);
    const target = slots.find((s) => s.slotId === '2026-09-22_09-00');
    expect(target?.status).toBe('mine');
  });
});
