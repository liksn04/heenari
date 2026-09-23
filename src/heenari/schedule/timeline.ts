import { addBookingDays, timeLabelOf } from '../reservations/slots';
import { weekdayOfDayKey } from '../reservations/calendar';
import type { ReservationView } from '../reservations/types';
import { eventDayKeys, eventEffectiveEnd, eventOverlaps, formatEventRange, kstInstant } from './eventPolicy';
import { ROOM_NAME } from './entry';
import type { ClubEventView, TimelineItem } from './types';

// KST 하루의 [시작, 끝) 인스턴트.
export function dayRange(dayKey: string): [Date, Date] {
  return [kstInstant(dayKey), kstInstant(addBookingDays(dayKey, 1))];
}

function reservationItem(reservation: ReservationView): TimelineItem {
  return {
    kind: 'reservation',
    id: reservation.id,
    title: reservation.title,
    startAt: reservation.startAt,
    allDay: false,
    timeLabel: `${timeLabelOf(reservation.startAt)}–${timeLabelOf(reservation.endAt)}`,
    tag: reservation.tag,
    place: ROOM_NAME,
    ownerId: reservation.ownerId,
    ownerName: reservation.ownerName,
    reservation,
  };
}

function eventItem(event: ClubEventView): TimelineItem {
  return {
    kind: 'event',
    id: event.id,
    title: event.title,
    startAt: event.startAt,
    allDay: event.allDay,
    timeLabel: formatEventRange(event),
    tag: event.tag,
    place: event.location,
    ownerId: event.createdBy,
    ownerName: null,
    event,
  };
}

function compareItems(a: TimelineItem, b: TimelineItem): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const byTime = a.startAt.getTime() - b.startAt.getTime();
  if (byTime !== 0) return byTime;
  return a.title.localeCompare(b.title, 'ko');
}

// 선택일의 예약과 그날에 걸친 일정을 구분 없이 한 줄로 합친다.
export function buildTimeline(dayKey: string, reservations: ReservationView[], events: ClubEventView[]): TimelineItem[] {
  const [from, to] = dayRange(dayKey);
  return [
    ...reservations.filter((reservation) => reservation.dayKey === dayKey).map(reservationItem),
    ...events.filter((event) => eventOverlaps(event, from, to)).map(eventItem),
  ].sort(compareItems);
}

// 아직 끝나지 않은(진행 중 포함) 가장 이른 일정.
export function nextUpcomingEvent(events: ClubEventView[], now: Date): ClubEventView | null {
  const candidates = events
    .filter((event) => event.startAt.getTime() >= now.getTime() || eventEffectiveEnd(event).getTime() > now.getTime())
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return candidates[0] ?? null;
}

// monthKey(YYYY-MM-01)가 가리키는 달에 속하는, 일정이 있는 날짜들.
export function eventDaysInMonth(monthKey: string, events: ClubEventView[]): Set<string> {
  const prefix = monthKey.slice(0, 7);
  const days = new Set<string>();
  for (const event of events) {
    for (const key of eventDayKeys(event)) {
      if (key.startsWith(prefix)) days.add(key);
    }
  }
  return days;
}


const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// '10월 2일 (금)'
export function dayLabel(dayKey: string): string {
  const [, month, day] = dayKey.split('-').map(Number);
  return `${month}월 ${day}일 (${WEEKDAY_LABELS[weekdayOfDayKey(dayKey)]})`;
}
