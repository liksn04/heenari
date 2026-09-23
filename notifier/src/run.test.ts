import { describe, expect, it, vi } from 'vitest';
import { runOnce } from './run';
import type { Device, Store } from './firestore';
import type { Messenger, SendResult } from './fcm';
import type { JamDoc, PushJob } from './logic';

const now = new Date('2030-01-01T09:00:00.000Z'); // 18:00 KST

function jam(overrides: Partial<JamDoc> = {}): JamDoc {
  return {
    collection: 'reservations', id: 'r1', title: '밴드 합주', authorId: 'owner', authorName: '김희나',
    startAt: new Date('2030-01-01T10:00:00.000Z'), tag: 'jam', participantIds: ['b'], location: null, dayKey: '2030-01-01',
    ...overrides,
  };
}

function fakeStore(init: { jobs?: PushJob[]; docs?: JamDoc[]; devices?: Record<string, Device[]>; claimed?: Set<string>; names?: Record<string, string> } = {}) {
  const deleted = { jobs: [] as string[], devices: [] as string[] };
  const claimed = init.claimed ?? new Set<string>();
  const docs = init.docs ?? [];
  const store: Store = {
    listPushJobs: vi.fn(async () => init.jobs ?? []),
    deletePushJob: vi.fn(async (id: string) => { deleted.jobs.push(id); }),
    getJamDoc: vi.fn(async (collection, id) => docs.find((doc) => doc.collection === collection && doc.id === id) ?? null),
    jamsStartingBetween: vi.fn(async (collection, from, to) => docs.filter((doc) => doc.collection === collection && doc.startAt > from && doc.startAt <= to)),
    memberName: vi.fn(async (uid) => init.names?.[uid] ?? null),
    listDevices: vi.fn(async (uid) => init.devices?.[uid] ?? []),
    deleteDevice: vi.fn(async (uid, id) => { deleted.devices.push(`${uid}/${id}`); }),
    claimLog: vi.fn(async (key) => {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    }),
  };
  return { store, deleted, claimed };
}

function fakeMessenger(results: Record<string, SendResult> = {}) {
  const sent: { token: string; title: string; body: string }[] = [];
  const messenger: Messenger = {
    send: vi.fn(async (token, message) => {
      const result = results[token] ?? 'sent';
      if (result === 'sent') sent.push({ token, title: message.title, body: message.body });
      return result;
    }),
  };
  return { messenger, sent };
}

const job = (overrides: Partial<PushJob> = {}): PushJob => ({ id: 'j1', kind: 'invite', collection: 'reservations', docId: 'r1', targetIds: ['b'], createdBy: 'owner', ...overrides });

describe('runOnce 초대', () => {
  it('초대받은 회원의 모든 기기로 보내고 작업을 지운다', async () => {
    const { store, deleted } = fakeStore({
      jobs: [job()],
      docs: [jam({ startAt: new Date('2030-01-02T10:00:00.000Z') })],
      devices: { b: [{ id: 'd1', token: 'phone' }, { id: 'd2', token: 'laptop' }] },
    });
    const { messenger, sent } = fakeMessenger();
    const summary = await runOnce(store, messenger, now);
    expect(sent.map((item) => item.token)).toEqual(['phone', 'laptop']);
    expect(sent[0]).toMatchObject({ title: '합주 초대', body: '김희나님이 1월 2일 19:00 합주에 초대했어요. 밴드 합주' });
    expect(deleted.jobs).toEqual(['j1']);
    expect(summary).toMatchObject({ jobs: 1, invitesSent: 2 });
  });

  it('일정 작성자 이름은 명부에서 찾고, 없으면 회원이라고 쓴다', async () => {
    const event = jam({ collection: 'events', id: 'e1', authorName: null, startAt: new Date('2030-01-02T10:00:00.000Z') });
    const withName = fakeStore({ jobs: [job({ collection: 'events', docId: 'e1' })], docs: [event], devices: { b: [{ id: 'd', token: 't' }] }, names: { owner: '이나리' } });
    const first = fakeMessenger();
    await runOnce(withName.store, first.messenger, now);
    expect(first.sent[0].body).toMatch(/^이나리님이/);
    const noName = fakeStore({ jobs: [job({ collection: 'events', docId: 'e1' })], docs: [event], devices: { b: [{ id: 'd', token: 't' }] } });
    const second = fakeMessenger();
    await runOnce(noName.store, second.messenger, now);
    expect(second.sent[0].body).toMatch(/^회원님이/);
  });

  it('가짜·깨진 작업은 보내지 않고 지운다', async () => {
    const { store, deleted } = fakeStore({
      jobs: [job({ id: 'forged', createdBy: 'intruder' }), job({ id: 'bad-collection', collection: 'admins' }), job({ id: 'boom' })],
      docs: [jam({ startAt: new Date('2030-01-02T10:00:00.000Z') })], // 리마인더 범위 밖: 초대 판단만 본다
      devices: { b: [{ id: 'd', token: 't' }] },
    });
    vi.mocked(store.getJamDoc).mockImplementation(async (_c, id) => { if (id === 'r1' && vi.mocked(store.getJamDoc).mock.calls.length === 2) throw new Error('net'); return jam({ startAt: new Date('2030-01-02T10:00:00.000Z') }); });
    const { messenger, sent } = fakeMessenger();
    const summary = await runOnce(store, messenger, now);
    expect(sent).toHaveLength(0);
    expect(deleted.jobs).toEqual(['forged', 'bad-collection', 'boom']);
    expect(summary.failures).toBe(1);
  });

  it('만료된 토큰은 기기 문서를 지우고, 일시 오류는 세기만 한다', async () => {
    const { store, deleted } = fakeStore({
      jobs: [job()],
      docs: [jam({ startAt: new Date('2030-01-02T10:00:00.000Z') })],
      devices: { b: [{ id: 'old', token: 'expired' }, { id: 'flaky', token: 'flaky' }, { id: 'ok', token: 'ok' }] },
    });
    const { messenger } = fakeMessenger({ expired: 'invalid-token', flaky: 'failed' });
    const summary = await runOnce(store, messenger, now);
    expect(deleted.devices).toEqual(['b/old']);
    expect(summary).toMatchObject({ invitesSent: 1, tokensRemoved: 1, failures: 1 });
  });
});

describe('runOnce 합주 1시간 전', () => {
  it('1시간 안의 합주를 예약자와 참여자에게 한 번만 보낸다', async () => {
    const claimed = new Set<string>();
    const setup = () => fakeStore({
      docs: [jam(), jam({ id: 'lesson', tag: 'lesson' }), jam({ id: 'far', startAt: new Date('2030-01-01T10:30:00.000Z') })],
      devices: { owner: [{ id: 'o', token: 'owner-phone' }], b: [{ id: 'b', token: 'b-phone' }] },
      claimed,
    });
    const first = fakeMessenger();
    const summary = await runOnce(setup().store, first.messenger, now);
    expect(first.sent.map((item) => [item.token, item.title])).toEqual([['owner-phone', '합주 1시간 전'], ['b-phone', '합주 1시간 전']]);
    expect(summary.remindersSent).toBe(2);

    // 다음 분 cron: 이미 기록이 있어 다시 보내지 않는다.
    const second = fakeMessenger();
    await runOnce(setup().store, second.messenger, new Date(now.getTime() + 60_000));
    expect(second.sent).toHaveLength(0);
  });

  it('일정(다른 장소 합주)도 알린다', async () => {
    const { store } = fakeStore({
      docs: [jam({ collection: 'events', id: 'e1', location: '합주실 A', startAt: new Date('2030-01-01T09:30:00.000Z') })],
      devices: { owner: [{ id: 'o', token: 't' }] },
    });
    const { messenger, sent } = fakeMessenger();
    await runOnce(store, messenger, now);
    expect(sent[0]).toMatchObject({ title: '합주 30분 전', body: '18:30 밴드 합주 · 합주실 A' });
  });
});
