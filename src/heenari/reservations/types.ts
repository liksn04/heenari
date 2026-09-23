import type { Timestamp } from 'firebase/firestore';

// docs/gates/HEENARI-FB-02-RESERVATION.md DATA CONTRACT 참조.

export interface Reservation {
  title: string; // 1..40
  note: string | null; // null 또는 0..200
  ownerId: string; // Firebase uid, immutable
  ownerName: string; // 표시용 스냅샷, 1..60
  startAt: Timestamp; // 30분 경계
  endAt: Timestamp; // startAt 이후, 최대 4시간
  dayKey: string; // YYYY-MM-DD, Asia/Seoul
  slotIds: string[]; // 1..8, 정렬·연속·중복 없음
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

export type SlotStatus = 'available' | 'mine' | 'reserved' | 'past';

export interface DaySlotView {
  slotId: string;
  label: string; // 'HH:mm'
  status: SlotStatus;
  reservationId: string | null;
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
}

export interface ReservationDraft {
  title: string;
  note: string | null;
  slotIds: string[];
}
