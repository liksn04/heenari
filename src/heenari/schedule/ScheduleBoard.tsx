import { useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { dayKeyOf } from '../reservations/slots';
import { startOfMonth } from '../reservations/calendar';
import { ScheduleCalendar } from './ScheduleCalendar';
import { ScheduleTimeline } from './ScheduleTimeline';
import { EntrySheet, type EntrySheetMode } from './EntrySheet';
import { useMembers } from '../members/useMembers';
import { buildTimeline, dayLabel } from './timeline';
import { useDayTimeline, useMonthEventDays } from './useScheduleData';
import type { TimelineItem } from './types';

export interface ScheduleViewer {
  uid: string;
  name: string;
  isAdmin: boolean;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// initialDay: 알림을 눌러 들어오면 /schedule?day=YYYY-MM-DD 의 날짜를 먼저 보여준다.
export function ScheduleBoard({ viewer, initialDay }: { viewer: ScheduleViewer; initialDay?: string | null }) {
  const today = useMemo(() => dayKeyOf(new Date()), []);
  const firstDay = initialDay && DAY_PATTERN.test(initialDay) ? initialDay : today;
  const [selected, setSelected] = useState(firstDay);
  const [month, setMonth] = useState(() => startOfMonth(firstDay));
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<EntrySheetMode | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const members = useMembers();

  const eventDays = useMonthEventDays(month, version);
  const day = useDayTimeline(selected, version);
  const items = buildTimeline(selected, day.data.reservations, day.data.events);

  function open(next: EntrySheetMode) {
    setNotice(null);
    setSheet(next);
  }

  // 예약은 본인의 시작 전 예약만, 일정은 작성자 또는 관리자만 연다. 최종 판정은 Rules다.
  function canOpen(item: TimelineItem): boolean {
    if (item.kind === 'event') return viewer.isAdmin || item.ownerId === viewer.uid;
    return item.ownerId === viewer.uid && item.startAt.getTime() > Date.now();
  }

  return (
    <div className="page-stack schedule-page">
      <section className="page-title">
        <p className="eyebrow">SCHEDULE</p>
        <h1>일정</h1>
        <p>날짜를 고르고 동아리방 시간이나 동아리 일정을 한 곳에서 등록하세요.</p>
      </section>

      <ScheduleCalendar
        month={month}
        selected={selected}
        eventDays={eventDays.data}
        onMonthChange={setMonth}
        onSelect={(dayKey) => {
          setSelected(dayKey);
          setNotice(null);
        }}
      />

      <section className="section-block" aria-labelledby="schedule-day-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TIMELINE</p>
            <h2 id="schedule-day-heading">{dayLabel(selected)}</h2>
          </div>
        </div>

        <button type="button" className="primary-button board-add" onClick={() => open({ kind: 'create', dayKey: selected })}>
          <CalendarPlus size={18} aria-hidden="true" /> 일정 추가
        </button>

        {notice && <p className="form-message" role="status" data-tone={notice.tone}>{notice.text}</p>}

        <ScheduleTimeline
          items={items}
          status={day.status}
          viewerId={viewer.uid}
          onRetry={() => void day.refresh()}
          canOpen={canOpen}
          names={members.names}
          onOpen={(item) => open(
            item.kind === 'event'
              ? { kind: 'edit-event', event: item.event }
              : { kind: 'edit-reservation', reservation: item.reservation },
          )}
        />
      </section>

      {sheet && (
        <EntrySheet
          mode={sheet}
          viewer={{ uid: viewer.uid, name: viewer.name }}
          onClose={() => setSheet(null)}
          onSaved={(message) => {
            setSheet(null);
            setNotice({ tone: 'success', text: message });
            setVersion((current) => current + 1);
          }}
          onStale={() => setVersion((current) => current + 1)}
        />
      )}
    </div>
  );
}
