import { describe, expect, it } from 'vitest';
import { kstInstant } from './eventPolicy';
import { buildTimeline, dayLabel, dayRange, eventDaysInMonth, nextJam } from './timeline';
import type { ClubEventView } from './types';
import type { ReservationView } from '../reservations/types';

function reservation(id: string, start: string, end: string, overrides: Partial<ReservationView> = {}): ReservationView {
  return {
    id,
    title: `예약 ${id}`,
    note: null,
    ownerId: 'u1',
    ownerName: '김희나',
    startAt: kstInstant('2026-10-02', start),
    endAt: kstInstant('2026-10-02', end),
    dayKey: '2026-10-02',
    slotIds: [],
    tag: 'jam',
    participantIds: [],
    ...overrides,
  };
}

function event(id: string, overrides: Partial<ClubEventView> = {}): ClubEventView {
  return {
    id,
    title: `일정 ${id}`,
    description: null,
    location: null,
    startAt: kstInstant('2026-10-02', '19:00'),
    endAt: null,
    allDay: false,
    tag: 'lesson',
    participantIds: [],
    createdBy: 'admin',
    ...overrides,
  };
}

describe('dayRange', () => {
  it('KST 하루의 [시작, 끝) 인스턴트를 준다', () => {
    const [from, to] = dayRange('2026-10-02');
    expect(from.toISOString()).toBe('2026-10-01T15:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-02T15:00:00.000Z');
  });
});

describe('buildTimeline', () => {
  const reservations = [reservation('r2', '20:00', '21:00'), reservation('r1', '09:00', '10:00')];
  const events = [
    event('e-evening', { startAt: kstInstant('2026-10-02', '19:00') }),
    event('e-allday', { allDay: true, startAt: kstInstant('2026-10-02') }),
    event('e-other-day', { startAt: kstInstant('2026-10-05', '19:00') }),
    event('e-overnight', { startAt: kstInstant('2026-10-01', '22:00'), endAt: kstInstant('2026-10-02', '02:00') }),
  ];

  it('종일 일정을 먼저, 그 뒤 시작 시각 순으로 구분 없이 합친다', () => {
    const items = buildTimeline('2026-10-02', reservations, events);
    expect(items.map((item) => item.id)).toEqual(['e-allday', 'e-overnight', 'r1', 'e-evening', 'r2']);
    expect(items.map((item) => item.kind)).toEqual(['event', 'event', 'reservation', 'event', 'reservation']);
  });

  it('같은 시각이면 제목 순으로 둔다', () => {
    const items = buildTimeline('2026-10-02', [reservation('r', '19:00', '20:00', { title: '가 합주' })], [event('e', { title: '나 모임' })]);
    expect(items.map((item) => item.id)).toEqual(['r', 'e']);
  });

  it('항목에 표시용 시간·장소·작성자를 담는다', () => {
    const items = buildTimeline(
      '2026-10-02',
      [reservation('r1', '09:00', '10:00')],
      [event('e1', { location: '강당', endAt: kstInstant('2026-10-02', '21:00') })],
    );
    expect(items[0]).toMatchObject({ kind: 'reservation', timeLabel: '09:00–10:00', place: '동아리방', ownerId: 'u1', ownerName: '김희나' });
    expect(items[1]).toMatchObject({ kind: 'event', timeLabel: '19:00–21:00', place: '강당', ownerId: 'admin', ownerName: null });
  });
});

describe('nextJam', () => {
  const now = kstInstant('2026-10-02', '12:00');
  const jam = (id: string, overrides: Partial<ClubEventView> = {}) => event(id, { tag: 'jam', ...overrides });

  it('끝나지 않은 가장 이른 합주 일정을 고른다', () => {
    const events = [
      jam('past', { startAt: kstInstant('2026-10-01', '19:00'), endAt: kstInstant('2026-10-01', '21:00') }),
      jam('later', { startAt: kstInstant('2026-10-03', '19:00') }),
      jam('ongoing', { startAt: kstInstant('2026-10-02', '11:00'), endAt: kstInstant('2026-10-02', '13:00') }),
    ];
    expect(nextJam([], events, now)?.id).toBe('ongoing');
  });

  it('오늘 종일 합주는 진행 중으로 보고, 이미 시작한 종료 없는 일정은 건너뛴다', () => {
    expect(nextJam([], [jam('today', { allDay: true, startAt: kstInstant('2026-10-02') }), jam('later', { startAt: kstInstant('2026-10-03', '19:00') })], now)?.id).toBe('today');
    expect(nextJam([], [jam('started', { startAt: kstInstant('2026-10-02', '11:00') })], now)).toBeNull();
  });

  it('동아리방 합주와 합주 일정 중 먼저 시작하는 것을, 진행 중 예약까지 포함해 고른다', () => {
    const item = nextJam(
      [reservation('room', '11:30', '12:30'), reservation('done', '10:00', '11:00')],
      [jam('outside', { startAt: kstInstant('2026-10-02', '13:00') })],
      now,
    );
    expect(item).toMatchObject({ kind: 'reservation', id: 'room', place: '동아리방', timeLabel: '11:30–12:30', ownerName: '김희나' });
    expect(nextJam([reservation('late', '18:00', '19:00')], [jam('outside', { startAt: kstInstant('2026-10-02', '13:00') })], now)?.id).toBe('outside');
  });

  it('합주가 아닌 예약·일정은 무시하고, 없으면 null', () => {
    expect(nextJam([reservation('lesson', '18:00', '19:00', { tag: 'lesson' }), reservation('old', '18:00', '19:00', { tag: null })], [event('etc', { tag: 'etc' }), event('none', { tag: null })], now)).toBeNull();
    expect(nextJam([], [], now)).toBeNull();
  });
});

describe('eventDaysInMonth', () => {
  it('해당 달에 걸친 일정 날짜만 모은다', () => {
    const days = eventDaysInMonth('2026-10-01', [
      event('a', { startAt: kstInstant('2026-09-30', '22:00'), endAt: kstInstant('2026-10-01', '02:00') }),
      event('b', { startAt: kstInstant('2026-10-15', '19:00') }),
      event('c', { startAt: kstInstant('2026-11-01', '19:00') }),
    ]);
    expect([...days].sort()).toEqual(['2026-10-01', '2026-10-15']);
  });
});

describe('dayLabel', () => {
  it('월·일·요일을 표시한다', () => {
    expect(dayLabel('2026-10-02')).toBe('10월 2일 (금)');
    expect(dayLabel('2026-10-04')).toBe('10월 4일 (일)');
  });
});
