import type { Timestamp } from 'firebase/firestore';
import type { Tag } from './policy';

// docs/gates/HEENARI-FB-02-RESERVATION.md DATA CONTRACT 참조.

export interface Reservation {
  title: string; // 1..40
  note: string | null; // null 또는 0..200
  ownerId: string; // Firebase uid, immutable
  ownerName: string; // 표시용 스냅샷, 1..60
  startAt: Timestamp; // 30분 경계
  endAt: Timestamp; // startAt 이후, 합주는 최대 1시간
  dayKey: string; // YYYY-MM-DD, Asia/Seoul
  slotIds: string[]; // 1..30, 정렬·연속·중복 없음
  tag?: Tag; // 태그가 없는 기존 예약도 있다
  createdAt: Timestamp; // immutable
  updatedAt: Timestamp;
}

export interface ReservationSlot {
  reservationId: string;
  ownerId: string;
  dayKey: string;
  startsAt: Timestamp;
  createdAt: Timestamp;
}

// 예약 목록·홈에서 쓰는 클라이언트 표현. Timestamp를 Date로 정규화한다.
export interface ReservationView {
  id: string;
  title: string;
  note: string | null;
  ownerId: string;
  ownerName: string;
  startAt: Date;
  endAt: Date;
  dayKey: string;
  slotIds: string[];
  tag: Tag | null; // 태그가 없던 기존 예약은 null
}

export interface ReservationDraft {
  title: string;
  note: string | null;
  slotIds: string[];
  tag?: Tag; // 생략하면 기타로 저장
}
