import { describe, expect, it } from 'vitest';
import {
  draftFromEvent,
  emptyEventDraft,
  EVENT_POLICY,
  EventValidationError,
  eventDayKeys,
  eventEffectiveEnd,
  eventOverlaps,
  formatEventRange,
  kstInstant,
  parseEventDraft,
  spansMultipleDays,
} from './eventPolicy';
import type { ClubEventView, EventDraft } from './types';

const HOUR = 60 * 60 * 1000;

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    title: '정기 모임',
    description: '',
    location: '',
    allDay: false,
    tag: 'etc',
    participantIds: [],
    startDate: '2026-10-02',
    startTime: '19:00',
    endDate: '2026-10-02',
    endTime: '21:00',
    ...overrides,
  };
}

function event(overrides: Partial<ClubEventView> = {}): ClubEventView {
  return {
    id: 'e1',
    title: '정기 모임',
    description: null,
    location: null,
    startAt: kstInstant('2026-10-02', '19:00'),
    endAt: kstInstant('2026-10-02', '21:00'),
    allDay: false,
    tag: null,
    participantIds: [],
    createdBy: 'admin',
    ...overrides,
  };
}

function reason(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof EventValidationError ? error.reason : 'unexpected';
  }
}

describe('kstInstant', () => {
  it('실행 환경 시간대와 무관하게 KST 벽시계 시각을 만든다', () => {
    expect(kstInstant('2026-10-02', '19:00').toISOString()).toBe('2026-10-02T10:00:00.000Z');
    expect(kstInstant('2026-10-03').toISOString()).toBe('2026-10-02T15:00:00.000Z');
  });
});

describe('parseEventDraft', () => {
  it('시간 일정을 KST 인스턴트로 변환하고 빈 설명·장소는 null로 만든다', () => {
    const input = parseEventDraft(draft({ description: '  ', location: ' 동아리방 ' }));
    expect(input).toEqual({
      title: '정기 모임',
      description: null,
      location: '동아리방',
      allDay: false,
      tag: 'etc',
      participantIds: [],
      startAt: new Date('2026-10-02T10:00:00.000Z'),
      endAt: new Date('2026-10-02T12:00:00.000Z'),
    });
  });

  it('종일 일정은 자정 시작, 종료 없음으로 만든다', () => {
    const input = parseEventDraft(draft({ allDay: true, startTime: '13:10', endTime: '14:00' }));
    expect(input.startAt.toISOString()).toBe('2026-10-01T15:00:00.000Z');
    expect(input.endAt).toBeNull();
    expect(input.allDay).toBe(true);
  });

  it('종료 시각을 비우면 종료 없는 일정이 된다', () => {
    expect(parseEventDraft(draft({ endTime: '' })).endAt).toBeNull();
  });

  it('종료 날짜를 비우면 시작 날짜를 쓴다', () => {
    expect(parseEventDraft(draft({ endDate: '' })).endAt?.toISOString()).toBe('2026-10-02T12:00:00.000Z');
  });

  it('제목 1–60자 경계를 지킨다', () => {
    expect(reason(() => parseEventDraft(draft({ title: '   ' })))).toBe('title');
    expect(reason(() => parseEventDraft(draft({ title: '가'.repeat(EVENT_POLICY.titleMax) })))).toBeNull();
    expect(reason(() => parseEventDraft(draft({ title: '가'.repeat(EVENT_POLICY.titleMax + 1) })))).toBe('title');
  });

  it('설명 500자, 장소 60자를 넘으면 거부한다', () => {
    expect(reason(() => parseEventDraft(draft({ description: '가'.repeat(500) })))).toBeNull();
    expect(reason(() => parseEventDraft(draft({ description: '가'.repeat(501) })))).toBe('description');
    expect(reason(() => parseEventDraft(draft({ location: '가'.repeat(61) })))).toBe('location');
  });

  it('날짜·시각 형식이 잘못되면 거부한다', () => {
    expect(reason(() => parseEventDraft(draft({ startDate: '' })))).toBe('start');
    expect(reason(() => parseEventDraft(draft({ startTime: '' })))).toBe('start');
    expect(reason(() => parseEventDraft(draft({ startDate: '2026-13-40' })))).toBe('start');
    expect(reason(() => parseEventDraft(draft({ endDate: 'bad' })))).toBe('end');
  });

  it('종료가 시작보다 늦지 않으면 거부한다', () => {
    expect(reason(() => parseEventDraft(draft({ endTime: '19:00' })))).toBe('end-order');
    expect(reason(() => parseEventDraft(draft({ endTime: '18:00' })))).toBe('end-order');
  });

  it('72시간까지 허용하고 넘으면 거부한다', () => {
    expect(reason(() => parseEventDraft(draft({ endDate: '2026-10-05', endTime: '19:00' })))).toBeNull();
    expect(reason(() => parseEventDraft(draft({ endDate: '2026-10-05', endTime: '19:01' })))).toBe('too-long');
  });
});

describe('draft 변환', () => {
  it('빈 초안은 선택한 날짜로 시작한다', () => {
    expect(emptyEventDraft('2026-10-02')).toMatchObject({ startDate: '2026-10-02', endDate: '2026-10-02', allDay: false, title: '' });
  });

  it('기존 일정을 수정용 초안으로 되돌리면 같은 입력이 된다', () => {
    const original = event({ description: '설명', location: '강당', endAt: kstInstant('2026-10-03', '01:30') });
    const back = parseEventDraft(draftFromEvent(original));
    expect(back).toEqual({
      title: original.title,
      description: '설명',
      location: '강당',
      allDay: false,
      tag: 'etc', // 태그 없던 일정은 기타로 수정된다
      participantIds: [],
      startAt: original.startAt,
      endAt: original.endAt,
    });
  });

  it('종료 없는 일정과 종일 일정도 되돌릴 수 있다', () => {
    expect(draftFromEvent(event({ endAt: null }))).toMatchObject({ endTime: '', endDate: '2026-10-02' });
    const allDay = event({ allDay: true, startAt: kstInstant('2026-10-02'), endAt: null });
    expect(draftFromEvent(allDay)).toMatchObject({ allDay: true, startDate: '2026-10-02' });
  });
});

describe('일정 기간 계산', () => {
  it('종일 일정은 하루 끝까지, 종료 없는 일정은 시작 순간까지 이어진다', () => {
    const allDay = event({ allDay: true, startAt: kstInstant('2026-10-02'), endAt: null });
    expect(eventEffectiveEnd(allDay).getTime()).toBe(kstInstant('2026-10-02').getTime() + 24 * HOUR);
    expect(eventEffectiveEnd(event({ endAt: null }))).toEqual(kstInstant('2026-10-02', '19:00'));
  });

  it('기간 겹침을 판정한다', () => {
    const day = (key: string) => [kstInstant(key), new Date(kstInstant(key).getTime() + 24 * HOUR)] as const;
    expect(eventOverlaps(event(), ...day('2026-10-02'))).toBe(true);
    expect(eventOverlaps(event(), ...day('2026-10-03'))).toBe(false);
    expect(eventOverlaps(event({ endAt: null }), ...day('2026-10-02'))).toBe(true);
    const overnight = event({ endAt: kstInstant('2026-10-04', '12:00') });
    expect(eventOverlaps(overnight, ...day('2026-10-03'))).toBe(true);
    expect(eventOverlaps(overnight, ...day('2026-10-04'))).toBe(true);
    expect(eventOverlaps(overnight, ...day('2026-10-05'))).toBe(false);
    // 자정에 끝나는 일정은 다음 날에 걸치지 않는다.
    expect(eventOverlaps(event({ endAt: kstInstant('2026-10-03') }), ...day('2026-10-03'))).toBe(false);
  });

  it('일정이 걸친 모든 날짜 키를 돌려준다', () => {
    expect(eventDayKeys(event())).toEqual(['2026-10-02']);
    expect(eventDayKeys(event({ endAt: kstInstant('2026-10-04', '12:00') }))).toEqual(['2026-10-02', '2026-10-03', '2026-10-04']);
    expect(eventDayKeys(event({ allDay: true, startAt: kstInstant('2026-10-02'), endAt: null }))).toEqual(['2026-10-02']);
    expect(eventDayKeys(event({ endAt: kstInstant('2026-10-03') }))).toEqual(['2026-10-02']);
  });
});

describe('spansMultipleDays', () => {
  it('종료일이 시작일과 다른 시간 일정만 참이다', () => {
    expect(spansMultipleDays(event({ endAt: kstInstant('2026-10-03', '01:00') }))).toBe(true);
    expect(spansMultipleDays(event())).toBe(false);
    expect(spansMultipleDays(event({ endAt: null }))).toBe(false);
    expect(spansMultipleDays(event({ allDay: true, startAt: kstInstant('2026-10-02'), endAt: null }))).toBe(false);
  });
});

describe('formatEventRange', () => {
  it('종일·단일 시각·같은 날·여러 날을 구분해 표시한다', () => {
    expect(formatEventRange(event({ allDay: true, startAt: kstInstant('2026-10-02'), endAt: null }))).toBe('종일');
    expect(formatEventRange(event({ endAt: null }))).toBe('19:00');
    expect(formatEventRange(event())).toBe('19:00–21:00');
    expect(formatEventRange(event({ endAt: kstInstant('2026-10-04', '12:00') }))).toBe('10/2 19:00 – 10/4 12:00');
  });
});
