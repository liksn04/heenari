import { beforeEach, describe, expect, it, vi } from 'vitest';

// 실제 Firestore 대신 인메모리 저장소로 배선을 검증한다 (에뮬레이터/Java 불필요).
const h = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  let autoId = 0;
  return {
    store,
    nextId: () => `auto-${(autoId += 1)}`,
    resetId: () => { autoId = 0; },
    docsResult: { current: [] as { id: string; data(): Record<string, unknown> }[] },
  };
});

vi.mock('../lib/firebase', () => ({
  getFirebaseDb: vi.fn(async () => ({ __db: true })),
}));

vi.mock('firebase/firestore', () => ({
  Timestamp: { fromDate: (date: Date) => ({ __ts: date.toISOString() }) },
  serverTimestamp: () => '__server',
  collection: (_db: unknown, name: string) => ({ __collection: name }),
  doc: (...args: unknown[]) => {
    if (args.length === 1) return { id: h.nextId() };
    const id = args[2] as string;
    return { id };
  },
  where: (field: string, op: string, value: unknown) => ({ __where: [field, op, value] }),
  orderBy: (field: string, dir: string) => ({ __orderBy: [field, dir] }),
  query: (coll: unknown, ...clauses: unknown[]) => ({ __query: { coll, clauses } }),
  getDocs: vi.fn(async () => ({ docs: h.docsResult.current })),
  runTransaction: async (_db: unknown, cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      get: (ref: { id: string }) => {
        const data = h.store.get(ref.id);
        return Promise.resolve({ id: ref.id, exists: () => data !== undefined, data: () => data });
      },
      set: (ref: { id: string }, data: Record<string, unknown>) => { h.store.set(ref.id, data); },
      update: (ref: { id: string }, data: Record<string, unknown>) => {
        h.store.set(ref.id, { ...h.store.get(ref.id), ...data });
      },
      delete: (ref: { id: string }) => { h.store.delete(ref.id); },
    };
    return cb(tx);
  },
}));

import {
  cancelReservation,
  createReservation,
  fetchDayReservations,
  fetchMyUpcomingReservations,
  rescheduleReservation,
  ReservationValidationError,
  SlotConflictError,
  updateReservationDetails,
} from './repository';

const now = new Date('2026-09-22T00:00:00.000Z'); // 09:00 KST
const draft = { title: '합주', note: '메모', slotIds: ['2026-09-22_18-00', '2026-09-22_18-30'] };

beforeEach(() => {
  h.store.clear();
  h.resetId();
  h.docsResult.current = [];
});

describe('createReservation 배선', () => {
  it('예약 문서와 슬롯 문서를 원자적으로 만든다', async () => {
    const id = await createReservation({ draft, ownerId: 'me', ownerName: '김희나', now });
    expect(h.store.get(id)).toMatchObject({ title: '합주', ownerId: 'me', dayKey: '2026-09-22' });
    expect(h.store.get('2026-09-22_18-00')).toMatchObject({ reservationId: id, ownerId: 'me' });
    expect(h.store.get('2026-09-22_18-30')).toMatchObject({ reservationId: id });
  });

  it('슬롯이 점유돼 있으면 충돌을 던지고 예약을 만들지 않는다', async () => {
    h.store.set('2026-09-22_18-30', { reservationId: 'other' });
    await expect(createReservation({ draft, ownerId: 'me', ownerName: '김희나', now }))
      .rejects.toBeInstanceOf(SlotConflictError);
    // 예약 문서(auto-*) 미생성
    expect([...h.store.keys()].some((k) => k.startsWith('auto-'))).toBe(false);
  });

  it('잘못된 초안은 DB 접근 전에 검증 오류를 던진다', async () => {
    await expect(createReservation({ draft: { title: '', note: null, slotIds: ['2026-09-22_18-00'] }, ownerId: 'me', ownerName: '김희나', now }))
      .rejects.toBeInstanceOf(ReservationValidationError);
  });
});

describe('cancelReservation 배선', () => {
  it('예약과 슬롯을 함께 지운다', async () => {
    h.store.set('res-1', { ownerId: 'me', slotIds: ['2026-09-22_18-00'], startAt: { toDate: () => new Date('2026-09-22T09:00:00.000Z') } });
    h.store.set('2026-09-22_18-00', { reservationId: 'res-1' });
    await cancelReservation({ reservationId: 'res-1', viewerId: 'me', now });
    expect(h.store.has('res-1')).toBe(false);
    expect(h.store.has('2026-09-22_18-00')).toBe(false);
  });
});

describe('updateReservationDetails 배선', () => {
  it('제목·메모만 갱신한다', async () => {
    h.store.set('res-1', { ownerId: 'me', title: '옛', startAt: { toDate: () => new Date('2026-09-22T09:00:00.000Z') } });
    await updateReservationDetails({ reservationId: 'res-1', viewerId: 'me', title: '새 제목', note: null, now });
    expect(h.store.get('res-1')).toMatchObject({ title: '새 제목', note: null });
  });

  it('잘못된 제목은 거부한다', async () => {
    await expect(updateReservationDetails({ reservationId: 'res-1', viewerId: 'me', title: '   ', note: null, now }))
      .rejects.toBeInstanceOf(ReservationValidationError);
  });
});

describe('rescheduleReservation 배선', () => {
  it('시간 변경을 하나의 트랜잭션으로 반영한다', async () => {
    h.store.set('res-1', { ownerId: 'me', slotIds: ['2026-09-22_18-00', '2026-09-22_18-30'], startAt: { toDate: () => new Date('2026-09-22T09:00:00.000Z') } });
    h.store.set('2026-09-22_18-00', { reservationId: 'res-1' });
    h.store.set('2026-09-22_18-30', { reservationId: 'res-1' });
    await rescheduleReservation({
      reservationId: 'res-1',
      viewerId: 'me',
      draft: { title: '합주', note: null, tag: 'jam', slotIds: ['2026-09-22_18-30', '2026-09-22_19-00'] },
      now,
    });
    expect(h.store.get('res-1')).toMatchObject({ tag: 'jam' });
    expect(h.store.has('2026-09-22_18-00')).toBe(false);
    expect(h.store.get('2026-09-22_19-00')).toMatchObject({ reservationId: 'res-1' });
    expect(h.store.get('res-1')).toMatchObject({ slotIds: ['2026-09-22_18-30', '2026-09-22_19-00'] });
  });
});

describe('쿼리 배선', () => {
  it('날짜별 예약을 뷰로 매핑한다', async () => {
    h.docsResult.current = [
      { id: 'res-1', data: () => ({ title: 'A', ownerId: 'me', ownerName: '김', dayKey: '2026-09-22', slotIds: ['2026-09-22_18-00'], startAt: { toDate: () => new Date('2026-09-22T09:00:00.000Z') }, endAt: { toDate: () => new Date('2026-09-22T09:30:00.000Z') } }) },
    ];
    const views = await fetchDayReservations('2026-09-22');
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ id: 'res-1', title: 'A', dayKey: '2026-09-22' });
    expect(views[0].startAt.toISOString()).toBe('2026-09-22T09:00:00.000Z');
  });

  it('내 예정 예약을 조회한다', async () => {
    h.docsResult.current = [
      { id: 'res-2', data: () => ({ title: 'B', ownerId: 'me', ownerName: '김', dayKey: '2026-09-23', slotIds: ['2026-09-23_18-00'], startAt: { toDate: () => new Date('2026-09-23T09:00:00.000Z') }, endAt: { toDate: () => new Date('2026-09-23T09:30:00.000Z') } }) },
    ];
    const views = await fetchMyUpcomingReservations('me', now);
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('res-2');
  });
});
