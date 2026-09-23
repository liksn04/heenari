import { describe, expect, it, vi } from 'vitest';
import { createStore, decodeValue, toJamDoc, toPushJob } from './firestore';

const BASE = 'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents';
const name = (path: string) => `projects/p/databases/(default)/documents/${path}`;

function reservationDoc(id: string, fields: Record<string, unknown> = {}) {
  return {
    name: name(`reservations/${id}`),
    fields: {
      title: { stringValue: '밴드 합주' },
      ownerId: { stringValue: 'owner' },
      ownerName: { stringValue: '김희나' },
      startAt: { timestampValue: '2030-01-01T10:00:00Z' },
      tag: { stringValue: 'jam' },
      dayKey: { stringValue: '2030-01-01' },
      participantIds: { arrayValue: { values: [{ stringValue: 'b' }] } },
      ...fields,
    },
  };
}

describe('디코딩', () => {
  it('Firestore REST 값을 JS 값으로 바꾼다', () => {
    expect(decodeValue({ stringValue: 'a' })).toBe('a');
    expect(decodeValue({ integerValue: '3' })).toBe(3);
    expect(decodeValue({ booleanValue: true })).toBe(true);
    expect(decodeValue({ nullValue: null })).toBeNull();
    expect(decodeValue({ timestampValue: '2030-01-01T00:00:00Z' })).toEqual(new Date('2030-01-01T00:00:00Z'));
    expect(decodeValue({ arrayValue: {} })).toEqual([]);
    expect(decodeValue({ mapValue: { fields: { a: { stringValue: 'x' } } } })).toEqual({ a: 'x' });
    expect(decodeValue(undefined)).toBeUndefined();
  });

  it('예약·일정 문서를 합주 문서로, 작업 문서를 작업으로 읽는다', () => {
    expect(toJamDoc('reservations', reservationDoc('r1'))).toEqual({
      collection: 'reservations', id: 'r1', title: '밴드 합주', authorId: 'owner', authorName: '김희나',
      startAt: new Date('2030-01-01T10:00:00Z'), tag: 'jam', participantIds: ['b'], location: null, dayKey: '2030-01-01',
    });
    const event = toJamDoc('events', { name: name('events/e1'), fields: { createdBy: { stringValue: 'x' }, startAt: { timestampValue: '2030-01-01T10:00:00Z' }, location: { stringValue: '합주실' } } });
    expect(event).toMatchObject({ authorId: 'x', authorName: null, location: '합주실', title: '합주', tag: null, participantIds: [] });
    expect(toJamDoc('reservations', { name: name('reservations/bad'), fields: {} })).toBeNull();
    expect(toJamDoc('events', { name: name('events/bad'), fields: { startAt: { timestampValue: '2030-01-01T10:00:00Z' } } })).toBeNull();
    expect(toPushJob({ name: name('pushJobs/j1'), fields: { kind: { stringValue: 'invite' }, targetIds: { arrayValue: { values: [{ stringValue: 'b' }, { integerValue: '1' }] } } } }))
      .toEqual({ id: 'j1', kind: 'invite', collection: '', docId: '', targetIds: ['b'], createdBy: '' });
  });
});

describe('createStore', () => {
  function setup(responder: (url: string, init: RequestInit) => Response) {
    const calls: [string, RequestInit][] = [];
    const fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push([url, init]);
      return responder(url, init);
    });
    return { store: createStore('p', async () => 'tok', fetcher), calls };
  }

  it('작업 목록·삭제와 인증 헤더', async () => {
    const { store, calls } = setup(() => new Response(JSON.stringify([{ document: { name: name('pushJobs/j1'), fields: {} } }, { readTime: 'x' }])));
    expect((await store.listPushJobs(50)).map((job) => job.id)).toEqual(['j1']);
    expect(calls[0][0]).toBe(`${BASE}:runQuery`);
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ structuredQuery: { from: [{ collectionId: 'pushJobs' }], limit: 50 } });
    expect((calls[0][1].headers as Record<string, string>).authorization).toBe('Bearer tok');
    await store.deletePushJob('j1');
    expect(calls[1]).toEqual([`${BASE}/pushJobs/j1`, expect.objectContaining({ method: 'DELETE' })]);
  });

  it('시작 시각 범위로 합주 후보를 조회한다', async () => {
    const { store, calls } = setup(() => new Response(JSON.stringify([{ document: reservationDoc('r1') }, { document: { name: name('reservations/x'), fields: {} } }])));
    const docs = await store.jamsStartingBetween('reservations', new Date('2030-01-01T09:00:00Z'), new Date('2030-01-01T10:00:00Z'));
    expect(docs.map((doc) => doc.id)).toEqual(['r1']);
    const query = JSON.parse(String(calls[0][1].body)).structuredQuery;
    expect(query.where.compositeFilter.filters.map((f: { fieldFilter: { op: string; value: { timestampValue: string } } }) => [f.fieldFilter.op, f.fieldFilter.value.timestampValue]))
      .toEqual([['GREATER_THAN', '2030-01-01T09:00:00.000Z'], ['LESS_THAN_OR_EQUAL', '2030-01-01T10:00:00.000Z']]);
  });

  it('문서·회원·기기를 읽고 없으면 비어 있는 값을 준다', async () => {
    const { store } = setup((url) => {
      if (url.endsWith('/reservations/r1')) return new Response(JSON.stringify(reservationDoc('r1')));
      if (url.endsWith('/members/owner')) return new Response(JSON.stringify({ name: name('members/owner'), fields: { name: { stringValue: '김희나' } } }));
      if (url.includes('/members/owner/devices')) {
        return new Response(JSON.stringify({ documents: [
          { name: name('members/owner/devices/d1'), fields: { token: { stringValue: 't1' } } },
          { name: name('members/owner/devices/d2'), fields: {} },
        ] }));
      }
      if (url.includes('/members/empty/devices')) return new Response(JSON.stringify({}));
      return new Response('', { status: 404 });
    });
    expect((await store.getJamDoc('reservations', 'r1'))?.title).toBe('밴드 합주');
    expect(await store.getJamDoc('reservations', 'ghost')).toBeNull();
    expect(await store.memberName('owner')).toBe('김희나');
    expect(await store.memberName('ghost')).toBeNull();
    expect(await store.listDevices('owner')).toEqual([{ id: 'd1', token: 't1' }]);
    expect(await store.listDevices('empty')).toEqual([]);
    expect(await store.listDevices('ghost')).toEqual([]);
  });

  it('발송 기록은 처음이면 true, 이미 있으면 false, 다른 오류는 던진다', async () => {
    let status = 200;
    const { store, calls } = setup(() => new Response('{}', { status }));
    expect(await store.claimLog('reminder_x', new Date('2030-01-01T00:00:00Z'))).toBe(true);
    expect(calls[0][0]).toBe(`${BASE}/pushLog?documentId=reminder_x`);
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ fields: { sentAt: { timestampValue: '2030-01-01T00:00:00.000Z' } } });
    status = 409;
    expect(await store.claimLog('reminder_x', new Date())).toBe(false);
    status = 500;
    await expect(store.claimLog('reminder_x', new Date())).rejects.toThrow('Firestore claim log 실패: 500');
    await store.deleteDevice('u1', 'd1').catch(() => undefined);
    expect(calls.at(-1)?.[0]).toBe(`${BASE}/members/u1/devices/d1`);
  });
});
