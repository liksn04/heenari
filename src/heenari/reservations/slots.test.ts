import { describe, expect, it } from 'vitest';
import {
  dayKeyOf,
  generateSlotIds,
  parseSlotId,
  slotIdToStartAt,
  slotLabelOf,
  slotStartAtToId,
  SLOTS_PER_DAY,
} from './slots';

describe('slot generation', () => {
  it('하루를 00:00부터 23:30까지 30분 슬롯으로 나눈다', () => {
    const ids = generateSlotIds('2026-09-22');
    expect(ids).toHaveLength(SLOTS_PER_DAY);
    expect(ids).toHaveLength(48);
    expect(ids[0]).toBe('2026-09-22_00-00');
    expect(ids[1]).toBe('2026-09-22_00-30');
    expect(ids.at(-1)).toBe('2026-09-22_23-30');
  });

  it('슬롯 라벨은 HH:mm 형식이다', () => {
    expect(slotLabelOf('2026-09-22_09-00')).toBe('09:00');
    expect(slotLabelOf('2026-09-22_23-30')).toBe('23:30');
  });
});

describe('Asia/Seoul 시간 변환은 실행 환경 시간대에 의존하지 않는다', () => {
  it('슬롯 시작 시각을 +09:00 기준으로 만든다', () => {
    expect(slotIdToStartAt('2026-09-22_09-00').toISOString()).toBe('2026-09-22T00:00:00.000Z');
    expect(slotIdToStartAt('2026-09-22_23-30').toISOString()).toBe('2026-09-22T14:30:00.000Z');
  });

  it('시작 시각을 다시 슬롯 ID로 되돌린다', () => {
    expect(slotStartAtToId(new Date('2026-09-22T00:00:00.000Z'))).toBe('2026-09-22_09-00');
    expect(slotStartAtToId(new Date('2026-09-22T14:30:00.000Z'))).toBe('2026-09-22_23-30');
  });

  it('UTC 자정 직전의 순간도 올바른 서울 날짜로 분류한다', () => {
    expect(dayKeyOf(new Date('2026-09-22T14:59:59.000Z'))).toBe('2026-09-22');
    expect(dayKeyOf(new Date('2026-09-22T15:00:00.000Z'))).toBe('2026-09-23');
  });

  it('슬롯 ID를 날짜·시각 조각으로 분해한다', () => {
    expect(parseSlotId('2026-09-22_09-30')).toEqual({
      dayKey: '2026-09-22',
      hour: 9,
      minute: 30,
      minuteOfDay: 570,
      label: '09:30',
    });
  });
});
