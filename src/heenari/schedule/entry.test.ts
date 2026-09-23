import { describe, expect, it } from 'vitest';
import {
  draftFromEventEntry,
  draftFromReservation,
  emptyEntryDraft,
  EntryValidationError,
  entryValidationMessage,
  planEntry,
  ROOM_NAME,
  ROOM_START_TIMES,
  roomEndOptions,
  snapToRoom,
} from './entry';
import { kstInstant } from './eventPolicy';
import type { EntryDraft } from './entry';
import type { ClubEventView } from './types';
import type { ReservationView } from '../reservations/types';

// 길이 제한이 없는 기타 태그, 18:00–20:00을 기본으로 둔다. 합주 제한은 별도 테스트에서 본다.
function draft(overrides: Partial<EntryDraft> = {}): EntryDraft {
  return { ...emptyEntryDraft('2026-10-02'), title: '합주', tag: 'etc', endTime: '20:00', ...overrides };
}

function reason(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof EntryValidationError ? error.reason : 'unexpected';
  }
}

describe('emptyEntryDraft', () => {
  it('동아리방·합주·선택일 18:00–19:00이 기본값이다', () => {
    expect(emptyEntryDraft('2026-10-02')).toEqual({
      title: '', description: '', location: '', place: 'room', allDay: false, tag: 'jam', participantIds: [],
      startDate: '2026-10-02', startTime: '18:00', endDate: '2026-10-02', endTime: '19:00',
    });
  });
});

describe('planEntry — 동아리방 시간 지정은 슬롯 잠금 예약', () => {
  it('30분 슬롯으로 바꾸고 설명을 메모로 옮긴다', () => {
    expect(planEntry(draft({ description: ' 드럼 세팅 ' }))).toEqual({
      kind: 'reservation',
      draft: {
        title: '합주',
        note: '드럼 세팅',
        tag: 'etc',
        participantIds: [],
        slotIds: ['2026-10-02_18-00', '2026-10-02_18-30', '2026-10-02_19-00', '2026-10-02_19-30'],
      },
    });
  });

  it('빈 설명은 메모 null', () => {
    const plan = planEntry(draft({ description: '  ' }));
    expect(plan.kind === 'reservation' && plan.draft.note).toBeNull();
  });

  it('종료 00:00은 그날 24:00으로 본다', () => {
    const plan = planEntry(draft({ startTime: '23:00', endTime: '00:00', endDate: '2026-10-03' }));
    expect(plan.kind === 'reservation' && plan.draft.slotIds).toEqual(['2026-10-02_23-00', '2026-10-02_23-30']);
    const sameDay = planEntry(draft({ startTime: '23:30', endTime: '00:00' }));
    expect(sameDay.kind === 'reservation' && sameDay.draft.slotIds).toEqual(['2026-10-02_23-30']);
  });

  it('새벽 포함 하루 안·30분 경계·길이 조건을 지킨다', () => {
    expect(reason(() => planEntry(draft({ startTime: '00:00', endTime: '01:00' })))).toBeNull(); // 새벽
    expect(reason(() => planEntry(draft({ startTime: '03:30', endTime: '04:30' })))).toBeNull();
    expect(reason(() => planEntry(draft({ startTime: '18:15' })))).toBe('room-hours');
    expect(reason(() => planEntry(draft({ endTime: '20:10' })))).toBe('room-hours');
    expect(reason(() => planEntry(draft({ endTime: '' })))).toBe('room-end');
    expect(reason(() => planEntry(draft({ endTime: '18:00' })))).toBe('end-order');
    expect(reason(() => planEntry(draft({ startTime: '09:00', endTime: '00:00' })))).toBeNull(); // 기타는 하루 전체 가능
    expect(reason(() => planEntry(draft({ endDate: '2026-10-03', endTime: '01:00' })))).toBe('room-span');
    expect(reason(() => planEntry(draft({ startDate: '2026-02-31' })))).toBe('start');
    expect(reason(() => planEntry(draft({ startTime: '' })))).toBe('start');
  });

  it('합주는 최대 1시간, 강습·기타는 길이 제한이 없다', () => {
    expect(reason(() => planEntry(draft({ tag: 'jam', endTime: '19:00' })))).toBeNull();
    expect(reason(() => planEntry(draft({ tag: 'jam', endTime: '19:30' })))).toBe('jam-too-long');
    const lesson = planEntry(draft({ tag: 'lesson', startTime: '10:00', endTime: '22:00' }));
    expect(lesson.kind === 'reservation' && lesson.draft.slotIds).toHaveLength(24);
    expect(lesson.kind === 'reservation' && lesson.draft.tag).toBe('lesson');
  });

  it('초대한 회원은 합주일 때만 저장한다', () => {
    const jam = planEntry(draft({ tag: 'jam', endTime: '19:00', participantIds: ['b', 'c'] }));
    expect(jam.kind === 'reservation' && jam.draft.participantIds).toEqual(['b', 'c']);
    const lesson = planEntry(draft({ tag: 'lesson', participantIds: ['b'] }));
    expect(lesson.kind === 'reservation' && lesson.draft.participantIds).toEqual([]);
    const outside = planEntry(draft({ tag: 'jam', place: 'other', participantIds: ['b'] }));
    expect(outside.kind === 'event' && outside.draft.participantIds).toEqual(['b']);
  });

  it('다른 장소의 합주는 태그만 붙고 길이 제한을 두지 않는다', () => {
    const plan = planEntry(draft({ tag: 'jam', place: 'other', endTime: '22:00' }));
    expect(plan.kind === 'event' && plan.draft.tag).toBe('jam');
  });

  it('제목 1–40자, 설명 200자 제한', () => {
    expect(reason(() => planEntry(draft({ title: ' ' })))).toBe('title');
    expect(reason(() => planEntry(draft({ title: '가'.repeat(40) })))).toBeNull();
    expect(reason(() => planEntry(draft({ title: '가'.repeat(41) })))).toBe('title');
    expect(reason(() => planEntry(draft({ description: '가'.repeat(201) })))).toBe('description');
  });
});

describe('planEntry — 그 외는 일반 일정', () => {
  it('다른 장소는 입력한 장소 이름으로 일정이 된다', () => {
    const plan = planEntry(draft({ place: 'other', location: ' 대강당 ', endDate: '2026-10-03', endTime: '12:00' }));
    expect(plan.kind).toBe('event');
    expect(plan.kind === 'event' && plan.draft).toMatchObject({ title: '합주', location: ' 대강당 ', endDate: '2026-10-03' });
  });

  it('동아리방 종일 일정은 잠그지 않는 일정이며 장소는 동아리방', () => {
    const plan = planEntry(draft({ allDay: true }));
    expect(plan.kind === 'event' && plan.draft).toMatchObject({ allDay: true, location: ROOM_NAME });
  });

  it('일정 규칙 위반은 같은 오류 타입으로 알린다', () => {
    expect(reason(() => planEntry(draft({ place: 'other', endTime: '17:00' })))).toBe('end-order');
    expect(reason(() => planEntry(draft({ place: 'other', location: '가'.repeat(61) })))).toBe('location');
    expect(reason(() => planEntry(draft({ place: 'other', endDate: '2026-10-06', endTime: '19:00' })))).toBe('too-long');
  });
});

describe('수정용 초안', () => {
  it('예약은 동아리방 시간 일정으로 되돌아와 같은 슬롯을 만든다', () => {
    const reservation: ReservationView = {
      id: 'r1', title: '합주', note: '메모', ownerId: 'u1', ownerName: '김희나',
      startAt: kstInstant('2026-10-02', '23:00'), endAt: kstInstant('2026-10-03', '00:00'),
      dayKey: '2026-10-02', slotIds: ['2026-10-02_23-00', '2026-10-02_23-30'], tag: 'lesson', participantIds: [],
    };
    const back = draftFromReservation(reservation);
    expect(back).toMatchObject({ place: 'room', allDay: false, description: '메모', endTime: '00:00' });
    expect(back.tag).toBe('lesson');
    expect(planEntry(back)).toEqual({ kind: 'reservation', draft: { title: '합주', note: '메모', tag: 'lesson', participantIds: [], slotIds: reservation.slotIds } });
    expect(draftFromReservation({ ...reservation, tag: null }).tag).toBe('etc'); // 태그 없던 기존 예약은 기타
  });

  it('일정은 종일 동아리방만 동아리방으로, 나머지는 장소 이름 그대로 되돌린다', () => {
    const base: ClubEventView = {
      id: 'e1', title: '공연 준비', description: null, location: ROOM_NAME,
      startAt: kstInstant('2026-10-02'), endAt: null, allDay: true, tag: null, participantIds: [], createdBy: 'a',
    };
    expect(draftFromEventEntry(base)).toMatchObject({ place: 'room', location: '' });
    expect(planEntry(draftFromEventEntry(base)).kind).toBe('event');
    const timedRoom = { ...base, allDay: false, startAt: kstInstant('2026-10-02', '19:00') };
    expect(draftFromEventEntry(timedRoom)).toMatchObject({ place: 'other', location: ROOM_NAME });
    expect(planEntry(draftFromEventEntry(timedRoom)).kind).toBe('event');
    expect(draftFromEventEntry({ ...base, location: null, allDay: false })).toMatchObject({ place: 'other', location: '' });
  });
});

describe('entryValidationMessage', () => {
  it('모든 사유에 사용자 문구가 있다', () => {
    const reasons = ['title', 'description', 'location', 'start', 'end', 'end-order', 'too-long',
      'room-end', 'room-span', 'room-hours', 'jam-too-long', 'kind-change'] as const;
    for (const item of reasons) expect(entryValidationMessage(item).length).toBeGreaterThan(5);
    expect(entryValidationMessage('title')).toBe('제목을 1~40자로 입력해주세요.');
    expect(entryValidationMessage('description')).toBe('설명은 200자 이하로 입력해주세요.');
  });
});

describe('동아리방 30분 시간 선택지', () => {
  it('시작은 00:00–23:30 30분 간격이다', () => {
    expect(ROOM_START_TIMES).toHaveLength(48);
    expect(ROOM_START_TIMES[0]).toBe('00:00');
    expect(ROOM_START_TIMES[1]).toBe('00:30');
    expect(ROOM_START_TIMES.at(-1)).toBe('23:30');
  });

  it('합주 종료는 시작 30분·1시간 뒤 두 가지뿐이다', () => {
    expect(roomEndOptions('18:00', 'jam')).toEqual([
      { value: '18:30', label: '18:30 (30분)' },
      { value: '19:00', label: '19:00 (1시간)' },
    ]);
  });

  it('강습·기타 종료는 24:00까지 모두 고를 수 있고 24:00은 00:00 값으로 둔다', () => {
    const options = roomEndOptions('18:00', 'lesson');
    expect(options).toHaveLength(12);
    expect(options[0].label).toBe('18:30 (30분)');
    expect(options[2].label).toBe('19:30 (1시간 30분)');
    expect(options.at(-1)).toEqual({ value: '00:00', label: '24:00 (6시간)' });
    expect(roomEndOptions('09:00', 'etc')).toHaveLength(30);
    expect(roomEndOptions('23:00', 'etc')).toEqual([
      { value: '23:30', label: '23:30 (30분)' },
      { value: '00:00', label: '24:00 (1시간)' },
    ]);
  });

  it('선택지에서 고른 값은 그대로 슬롯 예약이 된다', () => {
    for (const tag of ['jam', 'lesson', 'etc'] as const) {
      for (const start of ROOM_START_TIMES) {
        for (const { value } of roomEndOptions(start, tag)) {
          expect(planEntry(draft({ tag, startTime: start, endTime: value })).kind).toBe('reservation');
        }
      }
    }
  });

  it('snapToRoom은 선택지 밖 값을 가까운 30분 선택지로 맞추고 하루 안으로 묶는다', () => {
    expect(snapToRoom(draft({ startTime: '18:10', endTime: '19:50', endDate: '2026-10-03' }))).toMatchObject({
      startTime: '18:00', endTime: '20:00', endDate: '2026-10-02',
    });
    expect(snapToRoom(draft({ startTime: '07:10', endTime: '' }))).toMatchObject({ startTime: '07:00', endTime: '08:00' });
    expect(snapToRoom(draft({ startTime: '23:45', endTime: '23:50' }))).toMatchObject({ startTime: '23:30', endTime: '00:00' });
    expect(snapToRoom(draft({ startTime: '20:00', endTime: '19:00' }))).toMatchObject({ startTime: '20:00', endTime: '21:00' });
    expect(snapToRoom(draft({ startTime: '09:00', endTime: '15:00' }))).toMatchObject({ endTime: '15:00' }); // 기타는 유지
    expect(snapToRoom(draft({ tag: 'jam', startTime: '09:00', endTime: '15:00' }))).toMatchObject({ endTime: '10:00' });
    expect(snapToRoom(draft({ tag: 'jam', startTime: '18:00', endTime: '18:30' }))).toMatchObject({ endTime: '18:30' });
    expect(snapToRoom(draft({ startTime: '', endTime: '' }))).toMatchObject({ startTime: '18:00', endTime: '19:00' });
    const valid = draft({ startTime: '23:00', endTime: '00:00' });
    expect(snapToRoom(valid)).toEqual(valid);
  });
});
