import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addBookingDays, dayKeyOf } from './slots';
import { isBookableDay, RESERVATION_POLICY } from './policy';
import { addMonths, buildMonthCells, monthLabel, startOfMonth } from './calendar';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function ReservationCalendar({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (dayKey: string) => void;
}) {
  const today = useMemo(() => dayKeyOf(new Date()), []);
  const maxDay = useMemo(() => addBookingDays(today, RESERVATION_POLICY.bookingWindowDays), [today]);
  const [cursor, setCursor] = useState(() => startOfMonth(selected ?? today));

  const cells = useMemo(() => buildMonthCells(cursor), [cursor]);
  const canGoPrev = cursor > startOfMonth(today);
  const canGoNext = cursor < startOfMonth(maxDay);

  return (
    <section className="calendar" aria-label="예약 날짜 선택">
      <header className="calendar-head">
        <button
          type="button"
          className="round-button"
          aria-label="이전 달"
          disabled={!canGoPrev}
          onClick={() => setCursor((current) => addMonths(current, -1))}
        >
          <ChevronLeft />
        </button>
        <strong aria-live="polite">{monthLabel(cursor)}</strong>
        <button
          type="button"
          className="round-button"
          aria-label="다음 달"
          disabled={!canGoNext}
          onClick={() => setCursor((current) => addMonths(current, 1))}
        >
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
          const bookable = isBookableDay(dayKey);
          const isSelected = dayKey === selected;
          const isToday = dayKey === today;
          const dayNumber = Number(dayKey.slice(-2));
          return (
            <button
              key={dayKey}
              type="button"
              className="calendar-day"
              data-selected={isSelected}
              data-today={isToday}
              disabled={!bookable}
              aria-pressed={isSelected}
              aria-label={dayKey}
              onClick={() => onSelect(dayKey)}
            >
              {dayNumber}
            </button>
          );
        })}
      </div>
    </section>
  );
}
