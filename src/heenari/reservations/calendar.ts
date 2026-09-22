// 달력 표시는 Asia/Seoul 캘린더 날짜만 다루므로 Y/M/D 숫자로 순수 계산한다.

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

interface Ymd {
  year: number;
  month: number; // 1..12
  day: number;
}

function parseDayKey(dayKey: string): Ymd {
  const [year, month, day] = dayKey.split('-').map(Number);
  return { year, month, day };
}

export function startOfMonth(dayKey: string): string {
  const { year, month } = parseDayKey(dayKey);
  return `${year}-${pad2(month)}-01`;
}

export function addMonths(dayKey: string, delta: number): string {
  const { year, month } = parseDayKey(dayKey);
  const zeroBased = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = (zeroBased % 12) + 1;
  return `${nextYear}-${pad2(nextMonth)}-01`;
}

export function monthLabel(dayKey: string): string {
  const { year, month } = parseDayKey(dayKey);
  return `${year}년 ${month}월`;
}

// 0=일 .. 6=토
export function weekdayOfDayKey(dayKey: string): number {
  const { year, month, day } = parseDayKey(dayKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// 앞쪽 빈칸(null) + 실제 dayKey들, 전체 길이는 7의 배수.
export function buildMonthCells(monthDayKey: string): (string | null)[] {
  const start = startOfMonth(monthDayKey);
  const { year, month } = parseDayKey(start);
  const leading = weekdayOfDayKey(start);
  const total = daysInMonth(year, month);

  const cells: (string | null)[] = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) cells.push(`${year}-${pad2(month)}-${pad2(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
