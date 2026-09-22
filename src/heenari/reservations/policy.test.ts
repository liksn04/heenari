import { describe, expect, it } from 'vitest';
import {
  isBookableDay,
  isSlotAligned,
  RESERVATION_POLICY,
  reservationWindow,
  validateNote,
  validateSlotSelection,
  validateTitle,
} from './policy';

describe('RESERVATION_POLICY', () => {
  it('고정 정책 값을 노출한다', () => {
    expect(RESERVATION_POLICY.slotMinutes).toBe(30);
    expect(RESERVATION_POLICY.minSlots).toBe(1);
    expect(RESERVATION_POLICY.maxSlots).toBe(8);
    expect(RESERVATION_POLICY.bookingWindowDays).toBe(60);
    expect(RESERVATION_POLICY.timeZoneOffset).toBe('+09:00');
  });
});

describe('isSlotAligned', () => {
  it('30분 경계에 맞는 슬롯만 허용한다', () => {
    expect(isSlotAligned('2026-09-22_09-00')).toBe(true);
    expect(isSlotAligned('2026-09-22_09-30')).toBe(true);
    expect(isSlotAligned('2026-09-22_09-15')).toBe(false);
    expect(isSlotAligned('2026-09-22_08-30')).toBe(false); // 운영 시간 이전
    expect(isSlotAligned('2026-09-22_24-00')).toBe(false); // 마감 경계는 시작 슬롯이 아님
  });
});

describe('validateSlotSelection', () => {
  it('연속된 1개 슬롯을 허용한다', () => {
    expect(validateSlotSelection(['2026-09-22_09-00'])).toBeNull();
  });

  it('연속된 8개 슬롯(4시간)을 허용한다', () => {
    const ids = [
      '2026-09-22_09-00', '2026-09-22_09-30', '2026-09-22_10-00', '2026-09-22_10-30',
      '2026-09-22_11-00', '2026-09-22_11-30', '2026-09-22_12-00', '2026-09-22_12-30',
    ];
    expect(validateSlotSelection(ids)).toBeNull();
  });

  it('빈 선택을 거부한다', () => {
    expect(validateSlotSelection([])).toBe('empty');
  });

  it('9개(4시간 초과) 선택을 거부한다', () => {
    const ids = [
      '2026-09-22_09-00', '2026-09-22_09-30', '2026-09-22_10-00', '2026-09-22_10-30',
      '2026-09-22_11-00', '2026-09-22_11-30', '2026-09-22_12-00', '2026-09-22_12-30',
      '2026-09-22_13-00',
    ];
    expect(validateSlotSelection(ids)).toBe('too-many');
  });

  it('비연속 선택을 거부한다', () => {
    expect(validateSlotSelection(['2026-09-22_09-00', '2026-09-22_10-00'])).toBe('not-contiguous');
  });

  it('중복 슬롯을 거부한다', () => {
    expect(validateSlotSelection(['2026-09-22_09-00', '2026-09-22_09-00'])).toBe('duplicate');
  });

  it('서로 다른 날짜가 섞이면 거부한다', () => {
    expect(validateSlotSelection(['2026-09-22_23-30', '2026-09-23_00-00'])).toBe('mixed-day');
  });

  it('정렬 순서와 무관하게 연속이면 허용한다', () => {
    expect(validateSlotSelection(['2026-09-22_09-30', '2026-09-22_09-00'])).toBeNull();
  });
});

describe('reservationWindow', () => {
  it('선택 슬롯에서 시작·종료·날짜를 계산한다', () => {
    const window = reservationWindow(['2026-09-22_09-00', '2026-09-22_09-30']);
    expect(window.startAt.toISOString()).toBe('2026-09-22T00:00:00.000Z');
    expect(window.endAt.toISOString()).toBe('2026-09-22T01:00:00.000Z');
    expect(window.dayKey).toBe('2026-09-22');
  });
});

describe('validateTitle / validateNote', () => {
  it('제목은 1~40자여야 한다', () => {
    expect(validateTitle('연습')).toBe(true);
    expect(validateTitle('   ')).toBe(false);
    expect(validateTitle('')).toBe(false);
    expect(validateTitle('가'.repeat(40))).toBe(true);
    expect(validateTitle('가'.repeat(41))).toBe(false);
  });

  it('메모는 null이거나 0~200자여야 한다', () => {
    expect(validateNote(null)).toBe(true);
    expect(validateNote('')).toBe(true);
    expect(validateNote('가'.repeat(200))).toBe(true);
    expect(validateNote('가'.repeat(201))).toBe(false);
  });
});

describe('isBookableDay', () => {
  const now = new Date('2026-09-22T02:00:00.000Z'); // 2026-09-22 11:00 KST

  it('오늘을 허용한다', () => {
    expect(isBookableDay('2026-09-22', now)).toBe(true);
  });

  it('어제 이전을 거부한다', () => {
    expect(isBookableDay('2026-09-21', now)).toBe(false);
  });

  it('60일째를 허용하고 61일째를 거부한다', () => {
    expect(isBookableDay('2026-11-21', now)).toBe(true);  // +60일
    expect(isBookableDay('2026-11-22', now)).toBe(false); // +61일
  });
});
