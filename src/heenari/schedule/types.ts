import type { ReservationView } from '../reservations/types';
import type { Tag } from '../reservations/policy';

// docs/gates/HEENARI-FB-03-SCHEDULE.md DATA CONTRACT 참조.

// events/{eventId}를 Date로 정규화한 클라이언트 표현.
export interface ClubEventView {
  id: string;
  title: string; // 1..60
  description: string | null; // null 또는 1..500
  location: string | null; // null 또는 1..60
  startAt: Date;
  endAt: Date | null; // allDay면 null
  allDay: boolean; // true면 startAt은 KST 00:00
  tag: Tag | null; // 태그가 없던 기존 일정은 null
  createdBy: string;
}

// 일정 시트 입력값. 날짜는 YYYY-MM-DD, 시각은 HH:mm (모두 KST 벽시계).
export interface EventDraft {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  tag: Tag;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string; // 빈 문자열이면 종료 없음
}

// 검증을 통과해 Firestore에 쓸 수 있는 값.
export interface EventInput {
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  tag: Tag;
  startAt: Date;
  endAt: Date | null;
}

// 예약과 일정을 구분 없이 한 줄로 보여주기 위한 공통 표현. kind는 저장 방식일 뿐 화면에서 나누지 않는다.
interface TimelineBase {
  id: string;
  title: string;
  startAt: Date;
  timeLabel: string;
  tag: Tag | null;
  place: string | null;
  ownerId: string;
  ownerName: string | null;
}

export type TimelineItem =
  | (TimelineBase & { kind: 'reservation'; allDay: false; reservation: ReservationView })
  | (TimelineBase & { kind: 'event'; allDay: boolean; event: ClubEventView });
