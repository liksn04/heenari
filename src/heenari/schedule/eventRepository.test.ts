import { beforeEach, describe, expect, it, vi } from 'vitest';

// 실제 Firestore 대신 호출 기록으로 배선을 검증한다 (에뮬레이터/Java 불필요).
const h = vi.hoisted(() => ({
  docs: { current: [] as { id: string; data(): Record<string, unknown> }[] },
  calls: [] as { op: string; args: unknown[] }[],
  adminExists: { current: false },
}));

vi.mock('../lib/firebase', () => ({
  getFirebaseDb: vi.fn(async () => ({ __db: true })),
}));

vi.mock('firebase/firestore', () => ({
  Timestamp: { fromDate: (date: Date) => ({ toDate: () => date, __iso: date.toISOString() }) },
  serverTimestamp: () => '__server',
  collection: (_db: unknown, name: string) => ({ __collection: name }),
  doc: (_db: unknown, name: string, id: string) => ({ __doc: `${name}/${id}` }),
  where: (field: string, op: string, value: { __iso: string }) => ({ __where: [field, op, value.__iso] }),
  orderBy: (field: string, dir: string) => ({ __orderBy: [field, dir] }),
  limit: (count: number) => ({ __limit: count }),
  query: (coll: unknown, ...clauses: unknown[]) => ({ coll, clauses }),
  getDocs: vi.fn(async (q: unknown) => {
    h.calls.push({ op: 'getDocs', args: [q] });
    return { docs: h.docs.current };
  }),
  getDoc: vi.fn(async (ref: unknown) => {
    h.calls.push({ op: 'getDoc', args: [ref] });
    return { exists: () => h.adminExists.current };
  }),
  addDoc: vi.fn(async (coll: unknown, data: unknown) => {
    h.calls.push({ op: 'addDoc', args: [coll, data] });
    return { id: 'new-event' };
  }),
  updateDoc: vi.fn(async (ref: unknown, data: unknown) => {
    h.calls.push({ op: 'updateDoc', args: [ref, data] });
  }),
  deleteDoc: vi.fn(async (ref: unknown) => {
    h.calls.push({ op: 'deleteDoc', args: [ref] });
  }),
}));

import {
  createEvent,
  deleteEvent,
  fetchEventsBetween,
  fetchUpcomingEventCandidates,
  mapEventSnapshot,
  updateEvent,
} from './eventRepository';
import { EventValidationError, kstInstant } from './eventPolicy';
import { fetchIsAdmin } from '../admin/adminAccess';
import type { EventDraft } from './types';

const draft: EventDraft = {
  title: ' 정기 모임 ',
  description: '',
  location: '동아리방',
  allDay: false,
  tag: 'lesson',
  startDate: '2026-10-02',
  startTime: '19:00',
  endDate: '2026-10-02',
  endTime: '21:00',
};

function snap(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

beforeEach(() => {
  h.docs.current = [];
  h.calls.length = 0;
  h.adminExists.current = false;
});

describe('mapEventSnapshot', () => {
  it('Timestamp를 Date로 정규화하고 누락 필드를 기본값으로 채운다', () => {
    const start = kstInstant('2026-10-02', '19:00');
    const view = mapEventSnapshot(snap('e1', { title: '모임', startAt: { toDate: () => start }, endAt: null, allDay: false, createdBy: 'a' }));
    expect(view).toEqual({ id: 'e1', title: '모임', description: null, location: null, startAt: start, endAt: null, allDay: false, tag: null, createdBy: 'a' });
    expect(mapEventSnapshot({ id: 'x', data: () => undefined }).allDay).toBe(false);
    expect(mapEventSnapshot({ id: 'x', data: () => ({ tag: 'jam' }) }).tag).toBe('jam');
    expect(mapEventSnapshot({ id: 'x', data: () => ({ tag: 'party' }) }).tag).toBeNull();
  });
});

describe('fetchEventsBetween', () => {
  it('72시간 앞당긴 범위로 조회하고 실제 겹치는 일정만 돌려준다', async () => {
    h.docs.current = [
      snap('ended', { title: '어제', startAt: kstInstant('2026-10-01', '19:00'), endAt: kstInstant('2026-10-01', '21:00'), allDay: false, createdBy: 'a' }),
      snap('overnight', { title: 'MT', startAt: kstInstant('2026-10-01', '19:00'), endAt: kstInstant('2026-10-02', '12:00'), allDay: false, createdBy: 'a' }),
      snap('today', { title: '모임', startAt: kstInstant('2026-10-02', '19:00'), endAt: null, allDay: false, createdBy: 'a' }),
    ];
    const events = await fetchEventsBetween(kstInstant('2026-10-02'), kstInstant('2026-10-03'));
    expect(events.map((event) => event.id)).toEqual(['overnight', 'today']);
    const query = h.calls[0].args[0] as { coll: unknown; clauses: unknown[] };
    expect(query.coll).toEqual({ __collection: 'events' });
    expect(query.clauses).toEqual([
      { __where: ['startAt', '>=', '2026-09-28T15:00:00.000Z'] },
      { __where: ['startAt', '<', '2026-10-02T15:00:00.000Z'] },
      { __orderBy: ['startAt', 'asc'] },
    ]);
  });
});

describe('fetchUpcomingEventCandidates', () => {
  it('진행 중 일정을 포함하도록 앞당겨 제한 개수만 조회한다', async () => {
    h.docs.current = [snap('e1', { title: '모임', startAt: kstInstant('2026-10-02', '19:00'), allDay: false, createdBy: 'a' })];
    const events = await fetchUpcomingEventCandidates(kstInstant('2026-10-02', '12:00'));
    expect(events).toHaveLength(1);
    const query = h.calls[0].args[0] as { clauses: unknown[] };
    expect(query.clauses).toEqual([
      { __where: ['startAt', '>=', '2026-09-29T03:00:00.000Z'] },
      { __orderBy: ['startAt', 'asc'] },
      { __limit: 20 },
    ]);
  });
});

describe('일정 쓰기', () => {
  it('createEvent는 검증된 필드와 createdBy, 서버 시각을 쓴다', async () => {
    const id = await createEvent(draft, 'admin-x');
    expect(id).toBe('new-event');
    const [coll, data] = h.calls[0].args as [unknown, Record<string, unknown>];
    expect(coll).toEqual({ __collection: 'events' });
    expect(data).toMatchObject({
      title: '정기 모임',
      description: null,
      location: '동아리방',
      allDay: false,
      createdBy: 'admin-x',
      createdAt: '__server',
      updatedAt: '__server',
    });
    expect((data.startAt as { __iso: string }).__iso).toBe('2026-10-02T10:00:00.000Z');
    expect((data.endAt as { __iso: string }).__iso).toBe('2026-10-02T12:00:00.000Z');
    expect(data.tag).toBe('lesson');
    expect(Object.keys(data).sort()).toEqual(['allDay', 'createdAt', 'createdBy', 'description', 'endAt', 'location', 'startAt', 'tag', 'title', 'updatedAt']);
  });

  it('검증에 실패하면 Firestore를 호출하지 않는다', async () => {
    await expect(createEvent({ ...draft, title: '' }, 'admin-x')).rejects.toBeInstanceOf(EventValidationError);
    await expect(updateEvent('e1', { ...draft, endTime: '18:00' })).rejects.toBeInstanceOf(EventValidationError);
    expect(h.calls).toHaveLength(0);
  });

  it('updateEvent는 createdBy·createdAt 없이 내용과 updatedAt만 갱신한다', async () => {
    await updateEvent('e1', { ...draft, endTime: '' });
    const [ref, data] = h.calls[0].args as [unknown, Record<string, unknown>];
    expect(ref).toEqual({ __doc: 'events/e1' });
    expect(data.endAt).toBeNull();
    expect(data.updatedAt).toBe('__server');
    expect(data).not.toHaveProperty('createdBy');
    expect(data).not.toHaveProperty('createdAt');
  });

  it('deleteEvent는 해당 문서를 지운다', async () => {
    await deleteEvent('e1');
    expect(h.calls[0]).toEqual({ op: 'deleteDoc', args: [{ __doc: 'events/e1' }] });
  });
});

describe('fetchIsAdmin', () => {
  it('admins/{uid} 문서 존재 여부로 판정한다', async () => {
    expect(await fetchIsAdmin('u1')).toBe(false);
    h.adminExists.current = true;
    expect(await fetchIsAdmin('u1')).toBe(true);
    expect(h.calls.map((call) => call.args[0])).toEqual([{ __doc: 'admins/u1' }, { __doc: 'admins/u1' }]);
  });
});
