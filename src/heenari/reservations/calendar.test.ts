import { describe, expect, it } from 'vitest';
import { addMonths, buildMonthCells, monthLabel, startOfMonth, weekdayOfDayKey } from './calendar';

describe('calendar helpers', () => {
  it('월의 첫날과 라벨을 구한다', () => {
    expect(startOfMonth('2026-09-22')).toBe('2026-09-01');
    expect(monthLabel('2026-09-22')).toBe('2026년 9월');
  });

  it('월을 앞뒤로 이동한다(연도 경계 포함)', () => {
    expect(addMonths('2026-09-01', 1)).toBe('2026-10-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
  });

  it('요일 인덱스를 Asia/Seoul 달력 기준으로 계산한다', () => {
    // 2026-09-22는 화요일 → 2
    expect(weekdayOfDayKey('2026-09-22')).toBe(2);
    // 2026-09-01은 화요일 → 2
    expect(weekdayOfDayKey('2026-09-01')).toBe(2);
  });

  it('월 그리드를 앞쪽 빈칸 + 실제 날짜로 만든다', () => {
    const cells = buildMonthCells('2026-09-01');
    // 9월 1일이 화요일(2)이므로 앞에 빈칸 2개
    expect(cells.slice(0, 2)).toEqual([null, null]);
    expect(cells[2]).toBe('2026-09-01');
    // 9월은 30일 → 실제 날짜 30개
    expect(cells.filter((c) => c !== null)).toHaveLength(30);
    expect(cells.at(-1) === null || /^2026-09-30$/.test(String(cells[cells.length - 1]))).toBe(true);
    // 전체 길이는 7의 배수
    expect(cells.length % 7).toBe(0);
    expect(cells).toContain('2026-09-30');
  });
});
