import { describe, expect, it, vi } from 'vitest';
import {
  applyCancel,
  applyCreate,
  applyDetailUpdate,
  applyReschedule,
  assertValidDraft,
  buildReservationData,
  buildSlotData,
  mapReservationSnapshot,
  PastReservationError,
  ReservationNotFoundError,
  ReservationOwnershipError,
  ReservationValidationError,
  SlotConflictError,
  type DocRefLike,
  type DocSnapshotLike,
  type WriteTransaction,
} from './repository';

// ---- 주입용 가짜 트랜잭션 ---------------------------------------------------

interface Call {
  op: 'get' | 'set' | 'update' | 'delete';
  id: string;
}

function makeTx(existing: Record<string, Record<string, unknown>>) {
  const calls: Call[] = [];
  const tx: WriteTransaction = {
    get: (ref: DocRefLike) => {
      calls.push({ op: 'get', id: ref.id });
      const data = existing[ref.id];
      const snap: DocSnapshotLike = {
        id: ref.id,
        exists: () => data !== undefined,
        data: () => data,
      };
      return Promise.resolve(snap);
    },
    set: (ref, data) => { calls.push({ op: 'set', id: ref.id }); existing[ref.id] = data; },
    update: (ref, data) => { calls.push({ op: 'update', id: ref.id }); existing[ref.id] = { ...existing[ref.id], ...data }; },
    delete: (ref) => { calls.push({ op: 'delete', id: ref.id }); delete existing[ref.id]; },
  };
  return { tx, calls, existing };
}

const ref = (id: string): DocRefLike => ({ id });
const time = {
  fromDate: (d: Date) => ({ __ts: d.toISOString() }),
  serverTimestamp: () => '__server',
};

// ---- assertValidDraft -------------------------------------------------------

describe('assertValidDraft', () => {
  const now = new Date('2026-09-22T00:00:00.000Z'); // 09:00 KST

  it('유효한 초안을 통과시키고 예약 창을 반환한다', () => {
    const window = assertValidDraft(
      { title: '합주', note: null, slotIds: ['2026-09-22_18-00', '2026-09-22_18-30'] },
      now,
    );
    expect(window.dayKey).toBe('2026-09-22');
    expect(window.startAt.toISOString()).toBe('2026-09-22T09:00:00.000Z');
  });

  it('빈 제목을 거부한다', () => {
    expect(() => assertValidDraft({ title: ' ', note: null, slotIds: ['2026-09-22_18-00'] }, now))
      .toThrowError(ReservationValidationError);
  });

  it('비연속 슬롯을 거부한다', () => {
    expect(() => assertValidDraft({ title: 'x', note: null, slotIds: ['2026-09-22_18-00', '2026-09-22_19-00'] }, now))
      .toThrowError(/not-contiguous/);
  });

  it('합주 태그는 1시간(2슬롯)까지만, 강습·기타는 길이 제한 없이 통과한다', () => {
    const three = ['2026-09-22_18-00', '2026-09-22_18-30', '2026-09-22_19-00'];
    expect(() => assertValidDraft({ title: 'x', note: null, tag: 'jam', slotIds: three.slice(0, 2) }, now)).not.toThrow();
    expect(() => assertValidDraft({ title: 'x', note: null, tag: 'jam', slotIds: three }, now)).toThrowError(/jam-too-long/);
    expect(() => assertValidDraft({ title: 'x', note: null, tag: 'lesson', slotIds: three }, now)).not.toThrow();
    const tenHours = Array.from({ length: 20 }, (_, i) => {
      const minute = 10 * 60 + i * 30;
      return `2026-09-22_${String(Math.floor(minute / 60)).padStart(2, '0')}-${String(minute % 60).padStart(2, '0')}`;
    });
    expect(() => assertValidDraft({ title: 'x', note: null, tag: 'etc', slotIds: tenHours }, now)).not.toThrow();
  });

  it('이미 시작 시각이 지난 예약을 거부한다', () => {
    const later = new Date('2026-09-22T12:00:00.000Z'); // 21:00 KST
    expect(() => assertValidDraft({ title: 'x', note: null, slotIds: ['2026-09-22_18-00'] }, later))
      .toThrowError(/past/);
  });
});

// ---- 문서 빌더 --------------------------------------------------------------

describe('document builders', () => {
  it('예약 문서를 계약대로 만든다', () => {
    const data = buildReservationData(
      {
        draft: { title: '  합주  ', note: '   ', slotIds: ['2026-09-22_18-00', '2026-09-22_18-30'] },
        ownerId: 'me',
        ownerName: '김희나',
        window: {
          startAt: new Date('2026-09-22T09:00:00.000Z'),
          endAt: new Date('2026-09-22T10:00:00.000Z'),
          dayKey: '2026-09-22',
        },
      },
      time,
    );
    expect(data.title).toBe('합주');
    expect(data.note).toBeNull(); // 공백 메모는 null로 정규화
    expect(data.ownerId).toBe('me');
    expect(data.slotIds).toEqual(['2026-09-22_18-00', '2026-09-22_18-30']);
    expect(data.createdAt).toBe('__server');
    expect(data.startAt).toEqual({ __ts: '2026-09-22T09:00:00.000Z' });
    expect(data.tag).toBe('etc'); // 태그를 주지 않으면 기타로 저장
  });

  it('선택한 태그를 예약 문서에 담는다', () => {
    const data = buildReservationData(
      {
        draft: { title: '합주', note: null, tag: 'jam', slotIds: ['2026-09-22_18-00'] },
        ownerId: 'me',
        ownerName: '김희나',
        window: { startAt: new Date('2026-09-22T09:00:00.000Z'), endAt: new Date('2026-09-22T09:30:00.000Z'), dayKey: '2026-09-22' },
      },
      time,
    );
    expect(data.tag).toBe('jam');
  });

  it('슬롯 문서를 계약대로 만든다', () => {
    const data = buildSlotData('2026-09-22_18-00', 'me', 'res-1', '2026-09-22', time);
    expect(data).toEqual({
      reservationId: 'res-1',
      ownerId: 'me',
      dayKey: '2026-09-22',
      startsAt: { __ts: '2026-09-22T09:00:00.000Z' },
      createdAt: '__server',
    });
  });
});

// ---- applyCreate ------------------------------------------------------------

describe('applyCreate', () => {
  const plan = () => ({
    reservationRef: ref('res-1'),
    reservationData: { title: '합주' },
    slots: [
      { ref: ref('2026-09-22_18-00'), data: { reservationId: 'res-1' } },
      { ref: ref('2026-09-22_18-30'), data: { reservationId: 'res-1' } },
    ],
  });

  it('모든 슬롯을 읽은 뒤에만 쓴다', async () => {
    const { tx, calls } = makeTx({});
    await applyCreate(tx, plan());
    const firstWrite = calls.findIndex((c) => c.op === 'set');
    const lastRead = calls.map((c) => c.op).lastIndexOf('get');
    expect(lastRead).toBeLessThan(firstWrite);
    expect(calls.filter((c) => c.op === 'set')).toHaveLength(3); // 예약 1 + 슬롯 2
  });

  it('슬롯이 하나라도 점유돼 있으면 아무것도 쓰지 않고 충돌을 던진다', async () => {
    const { tx, calls } = makeTx({ '2026-09-22_18-30': { reservationId: 'other' } });
    await expect(applyCreate(tx, plan())).rejects.toBeInstanceOf(SlotConflictError);
    expect(calls.some((c) => c.op === 'set')).toBe(false);
  });
});

// ---- applyCancel ------------------------------------------------------------

describe('applyCancel', () => {
  const now = new Date('2026-09-22T00:00:00.000Z');
  const future = { ownerId: 'me', slotIds: ['2026-09-22_18-00', '2026-09-22_18-30'], startAt: { toDate: () => new Date('2026-09-22T09:00:00.000Z') } };

  const plan = () => ({
    reservationRef: ref('res-1'),
    slotRef: (slotId: string) => ref(slotId),
    viewerId: 'me',
    now,
  });

  it('예약과 모든 슬롯을 함께 삭제한다', async () => {
    const { tx, calls, existing } = makeTx({
      'res-1': { ...future },
      '2026-09-22_18-00': { reservationId: 'res-1' },
      '2026-09-22_18-30': { reservationId: 'res-1' },
    });
    await applyCancel(tx, plan());
    expect(existing['res-1']).toBeUndefined();
    expect(existing['2026-09-22_18-00']).toBeUndefined();
    expect(existing['2026-09-22_18-30']).toBeUndefined();
    expect(calls.filter((c) => c.op === 'delete')).toHaveLength(3);
  });

  it('없는 예약은 NotFound를 던진다', async () => {
    const { tx } = makeTx({});
    await expect(applyCancel(tx, plan())).rejects.toBeInstanceOf(ReservationNotFoundError);
  });

  it('다른 사용자의 예약은 Ownership을 던진다', async () => {
    const { tx } = makeTx({ 'res-1': { ...future, ownerId: 'other' } });
    await expect(applyCancel(tx, plan())).rejects.toBeInstanceOf(ReservationOwnershipError);
  });

  it('이미 시작한 예약은 Past를 던진다', async () => {
    const started = { ...future, startAt: { toDate: () => new Date('2026-09-21T00:00:00.000Z') } };
    const { tx } = makeTx({ 'res-1': started });
    await expect(applyCancel(tx, plan())).rejects.toBeInstanceOf(PastReservationError);
  });
});

// ---- applyReschedule --------------------------------------------------------

describe('applyReschedule', () => {
  const now = new Date('2026-09-22T00:00:00.000Z');
  const existingRes = {
    ownerId: 'me',
    slotIds: ['2026-09-22_18-00', '2026-09-22_18-30'],
    startAt: { toDate: () => new Date('2026-09-22T09:00:00.000Z') },
  };

  const plan = (newSlotIds: string[]) => ({
    reservationRef: ref('res-1'),
    slotRef: (slotId: string) => ref(slotId),
    viewerId: 'me',
    now,
    newSlotIds,
    reservationUpdate: { slotIds: newSlotIds, updatedAt: '__server' },
    slotData: (slotId: string) => ({ reservationId: 'res-1', slotId }),
  });

  it('빠진 슬롯은 지우고 새 슬롯만 만들며 예약을 갱신한다', async () => {
    const { tx, existing } = makeTx({
      'res-1': { ...existingRes },
      '2026-09-22_18-00': { reservationId: 'res-1' },
      '2026-09-22_18-30': { reservationId: 'res-1' },
    });
    // 18-30 유지, 18-00 제거, 19-00 추가
    await applyReschedule(tx, plan(['2026-09-22_18-30', '2026-09-22_19-00']));
    expect(existing['2026-09-22_18-00']).toBeUndefined(); // 제거
    expect(existing['2026-09-22_19-00']).toEqual({ reservationId: 'res-1', slotId: '2026-09-22_19-00' }); // 추가
    expect(existing['2026-09-22_18-30']).toEqual({ reservationId: 'res-1' }); // 유지(재생성 안 함)
    expect(existing['res-1']).toMatchObject({ slotIds: ['2026-09-22_18-30', '2026-09-22_19-00'] });
  });

  it('새 슬롯이 남의 예약이면 기존 예약을 그대로 두고 충돌을 던진다', async () => {
    const { tx, existing } = makeTx({
      'res-1': { ...existingRes },
      '2026-09-22_18-00': { reservationId: 'res-1' },
      '2026-09-22_18-30': { reservationId: 'res-1' },
      '2026-09-22_19-00': { reservationId: 'other' },
    });
    await expect(applyReschedule(tx, plan(['2026-09-22_18-30', '2026-09-22_19-00'])))
      .rejects.toBeInstanceOf(SlotConflictError);
    // 기존 예약과 슬롯 보존
    expect(existing['res-1']).toMatchObject({ slotIds: ['2026-09-22_18-00', '2026-09-22_18-30'] });
    expect(existing['2026-09-22_18-00']).toEqual({ reservationId: 'res-1' });
  });
});

// ---- applyDetailUpdate ------------------------------------------------------

describe('applyDetailUpdate', () => {
  const now = new Date('2026-09-22T00:00:00.000Z');
  const future = { ownerId: 'me', startAt: { toDate: () => new Date('2026-09-22T09:00:00.000Z') } };

  it('제목·메모만 갱신한다', async () => {
    const { tx, existing } = makeTx({ 'res-1': { ...future, title: '옛 제목' } });
    await applyDetailUpdate(tx, {
      reservationRef: ref('res-1'),
      viewerId: 'me',
      now,
      update: { title: '새 제목', note: null, updatedAt: '__server' },
    });
    expect(existing['res-1']).toMatchObject({ title: '새 제목', note: null });
  });

  it('다른 사용자의 예약 수정은 거부한다', async () => {
    const { tx } = makeTx({ 'res-1': { ...future, ownerId: 'other' } });
    await expect(applyDetailUpdate(tx, {
      reservationRef: ref('res-1'),
      viewerId: 'me',
      now,
      update: { title: 'x', note: null, updatedAt: '__server' },
    })).rejects.toBeInstanceOf(ReservationOwnershipError);
  });
});

// ---- mapReservationSnapshot -------------------------------------------------

describe('mapReservationSnapshot', () => {
  it('Timestamp를 Date로 정규화한 뷰를 만든다', () => {
    const view = mapReservationSnapshot({
      id: 'res-1',
      data: () => ({
        title: '합주',
        note: null,
        ownerId: 'me',
        ownerName: '김희나',
        dayKey: '2026-09-22',
        slotIds: ['2026-09-22_18-00'],
        startAt: { toDate: () => new Date('2026-09-22T09:00:00.000Z') },
        endAt: { toDate: () => new Date('2026-09-22T09:30:00.000Z') },
      }),
    });
    expect(view).toMatchObject({
      id: 'res-1',
      title: '합주',
      ownerId: 'me',
      dayKey: '2026-09-22',
    });
    expect(view.startAt.toISOString()).toBe('2026-09-22T09:00:00.000Z');
    expect(view.tag).toBeNull(); // 태그가 없던 기존 예약
  });

  it('알려진 태그만 읽고 모르는 값은 null로 둔다', () => {
    const base = { title: '합주', note: null, ownerId: 'me', ownerName: '김희나', dayKey: '2026-09-22', slotIds: [], startAt: new Date(), endAt: new Date() };
    expect(mapReservationSnapshot({ id: 'a', data: () => ({ ...base, tag: 'lesson' }) }).tag).toBe('lesson');
    expect(mapReservationSnapshot({ id: 'b', data: () => ({ ...base, tag: 'party' }) }).tag).toBeNull();
  });
});

// silence unused import warning for vi in case not used above
void vi;
