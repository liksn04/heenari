import { describe, expect, it } from 'vitest';
import { inviteMessage, inviteTargets, reminderFor, type JamDoc, type PushJob } from './logic';

const start = new Date('2030-01-01T10:00:00.000Z'); // 19:00 KST

function doc(overrides: Partial<JamDoc> = {}): JamDoc {
  return {
    collection: 'reservations',
    id: 'r1',
    title: '밴드 합주',
    authorId: 'owner',
    authorName: '김희나',
    startAt: start,
    tag: 'jam',
    participantIds: ['b', 'c'],
    location: null,
    dayKey: '2030-01-01',
    ...overrides,
  };
}

function job(overrides: Partial<PushJob> = {}): PushJob {
  return { id: 'j1', kind: 'invite', collection: 'reservations', docId: 'r1', targetIds: ['b', 'c'], createdBy: 'owner', ...overrides };
}

describe('inviteTargets', () => {
  it('작업 대상 중 지금도 참여자인 회원에게만 보낸다', () => {
    expect(inviteTargets(job(), doc())).toEqual(['b', 'c']);
    expect(inviteTargets(job({ targetIds: ['b', 'b', 'x'] }), doc())).toEqual(['b']); // 중복·비참여자 제외
    expect(inviteTargets(job(), doc({ participantIds: ['c'] }))).toEqual(['c']); // 그사이 빠진 회원 제외
  });

  it('가짜 작업은 보내지 않는다', () => {
    expect(inviteTargets(job({ createdBy: 'intruder' }), doc())).toEqual([]);
    expect(inviteTargets(job({ kind: 'spam' }), doc())).toEqual([]);
    expect(inviteTargets(job({ collection: 'admins' }), doc())).toEqual([]);
    expect(inviteTargets(job(), null)).toEqual([]);
    expect(inviteTargets(job({ docId: 'other' }), doc())).toEqual([]);
    expect(inviteTargets(job({ collection: 'events' }), doc())).toEqual([]);
    expect(inviteTargets(job({ targetIds: ['owner'] }), doc({ participantIds: ['owner'] }))).toEqual([]);
  });
});

describe('inviteMessage', () => {
  it('누가 언제 어떤 합주에 초대했는지 알린다', () => {
    expect(inviteMessage(doc(), '김희나')).toEqual({
      title: '합주 초대',
      body: '김희나님이 1월 1일 19:00 합주에 초대했어요. 밴드 합주',
      url: '/schedule?day=2030-01-01',
      tag: 'invite-r1',
    });
    expect(inviteMessage(doc({ dayKey: null }), '김희나').url).toBe('/schedule?day=2030-01-01');
  });
});

describe('reminderFor', () => {
  const at = (minutesBefore: number) => new Date(start.getTime() - minutesBefore * 60000);

  it('시작 1시간 안의 합주를 예약자와 참여자에게 알린다', () => {
    const reminder = reminderFor(doc(), at(60));
    expect(reminder).toEqual({
      key: `reminder_reservations_r1_${start.getTime()}`,
      recipients: ['owner', 'b', 'c'],
      message: { title: '합주 1시간 전', body: '19:00 밴드 합주 · 동아리방', url: '/schedule?day=2030-01-01', tag: 'reminder-r1' },
    });
  });

  it('늦게 잡힌 합주는 남은 분을 알린다', () => {
    expect(reminderFor(doc(), at(20))?.message.title).toBe('합주 20분 전');
    expect(reminderFor(doc(), at(56))?.message.title).toBe('합주 1시간 전');
  });

  it('1시간보다 멀거나 이미 시작했거나 합주가 아니면 보내지 않는다', () => {
    expect(reminderFor(doc(), at(61))).toBeNull();
    expect(reminderFor(doc(), at(0))).toBeNull();
    expect(reminderFor(doc(), new Date(start.getTime() + 60000))).toBeNull();
    expect(reminderFor(doc({ tag: 'lesson' }), at(30))).toBeNull();
    expect(reminderFor(doc({ tag: null }), at(30))).toBeNull();
  });

  it('일정은 장소를 붙이고, 장소가 없으면 생략한다', () => {
    expect(reminderFor(doc({ collection: 'events', location: '합주실 A' }), at(60))?.message.body).toBe('19:00 밴드 합주 · 합주실 A');
    expect(reminderFor(doc({ collection: 'events', location: null }), at(60))?.message.body).toBe('19:00 밴드 합주');
  });

  it('참여자와 작성자가 겹쳐도 한 번만 받는다', () => {
    expect(reminderFor(doc({ participantIds: ['owner', 'b'] }), at(30))?.recipients).toEqual(['owner', 'b']);
  });
});
