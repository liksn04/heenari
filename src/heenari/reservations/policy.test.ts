import { describe, expect, it } from 'vitest';
import {
  isBookableDay,
  JAM_MAX_SLOTS,
  maxSlotsFor,
  TAG_LABELS,
  TAGS,
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
    expect(RESERVATION_POLICY.maxSlots).toBe(48); // 00:00–24:00 하루 전체
    expect(JAM_MAX_SLOTS).toBe(2); // 합주 1시간
    expect(RESERVATION_POLICY.bookingWindowDays).toBe(60);
    expect(RESERVATION_POLICY.timeZoneOffset).toBe('+09:00');
  });
});

describe('isSlotAligned', () => {
  it('30분 경계에 맞는 슬롯만 허용한다', () => {
    expect(isSlotAligned('2026-09-22_09-00')).toBe(true);
    expect(isSlotAligned('2026-09-22_09-30')).toBe(true);
    expect(isSlotAligned('2026-09-22_09-15')).toBe(false);
    expect(isSlotAligned('2026-09-22_00-00')).toBe(true); // 새벽도 예약 가능
    expect(isSlotAligned('2026-09-22_03-30')).toBe(true);
    expect(isSlotAligned('2026-09-22_24-00')).toBe(false); // 마감 경계는 시작 슬롯이 아님
  });
});

describe('validateSlotSelection', () => {
  it('연속된 1개 슬롯을 허용한다', () => {
    expect(validateSlotSelection(['2026-09-22_09-00'])).toBeNull();
  });

  it('00:00–24:00 하루 전체 48개 연속 슬롯을 허용한다', () => {
    const ids = Array.from({ length: 48 }, (_, i) => {
      const minute = i * 30;
      return `2026-09-22_${String(Math.floor(minute / 60)).padStart(2, '0')}-${String(minute % 60).padStart(2, '0')}`;
    });
    expect(validateSlotSelection(ids)).toBeNull();
  });

  it('빈 선택을 거부한다', () => {
    expect(validateSlotSelection([])).toBe('empty');
  });

  it('하루(48개)를 넘는 선택을 거부한다', () => {
    const ids = Array.from({ length: 49 }, (_, i) => `2026-09-22_x-${i}`);
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

describe('태그', () => {
  it('합주·강습·기타 세 가지이고 합주만 1시간으로 제한한다', () => {
    expect(TAGS).toEqual(['jam', 'lesson', 'etc']);
    expect(TAG_LABELS).toEqual({ jam: '합주', lesson: '강습', etc: '기타' });
    expect(maxSlotsFor('jam')).toBe(2);
    expect(maxSlotsFor('lesson')).toBe(48);
    expect(maxSlotsFor('etc')).toBe(48);
  });
});
