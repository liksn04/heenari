import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dayKeyOf } from '../reservations/slots';
import { addMonths, buildMonthCells, monthLabel } from '../reservations/calendar';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface ScheduleCalendarProps {
  month: string; // YYYY-MM-01
  selected: string;
  eventDays: Set<string>;
  onMonthChange: (month: string) => void;
  onSelect: (dayKey: string) => void;
}

// 일정 조회용 달력. 예약 달력과 달리 지난 달·먼 미래도 볼 수 있다.
export function ScheduleCalendar({ month, selected, eventDays, onMonthChange, onSelect }: ScheduleCalendarProps) {
  const today = useMemo(() => dayKeyOf(new Date()), []);
  const cells = useMemo(() => buildMonthCells(month), [month]);

  return (
    <section className="calendar" aria-label="일정 날짜 선택">
      <header className="calendar-head">
        <button type="button" className="round-button" aria-label="이전 달" onClick={() => onMonthChange(addMonths(month, -1))}>
          <ChevronLeft />
        </button>
        <strong aria-live="polite">{monthLabel(month)}</strong>
        <button type="button" className="round-button" aria-label="다음 달" onClick={() => onMonthChange(addMonths(month, 1))}>
          <ChevronRight />
        </button>
      </header>

      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="calendar-grid" role="grid">
        {cells.map((dayKey, index) => {
          if (dayKey === null) return <span key={`blank-${index}`} className="calendar-blank" aria-hidden="true" />;
          const isSelected = dayKey === selected;
          const hasEvent = eventDays.has(dayKey);
          return (
            <button
              key={dayKey}
              type="button"
              className="calendar-day"
              data-selected={isSelected}
              data-today={dayKey === today}
              aria-pressed={isSelected}
              aria-label={hasEvent ? `${dayKey} 일정 있음` : dayKey}
              onClick={() => onSelect(dayKey)}
            >
              {Number(dayKey.slice(-2))}
              {hasEvent && <span className="calendar-mark" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
