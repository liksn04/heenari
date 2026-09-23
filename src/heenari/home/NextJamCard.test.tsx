import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { kstInstant } from '../schedule/eventPolicy';
import type { ClubEventView, TimelineItem } from '../schedule/types';
import { NextJamCard } from './NextJamCard';

afterEach(cleanup);

const names = new Map([['host', '김희나'], ['u2', '박드럼'], ['u3', '최베이스']]);
const now = kstInstant('2026-10-02', '12:00');

function eventJam(overrides: Partial<ClubEventView> = {}): TimelineItem {
  const event: ClubEventView = {
    id: 'e1', title: '버스킹 합주', description: null, location: '한강공원', startAt: kstInstant('2026-10-03', '19:00'),
    endAt: kstInstant('2026-10-03', '21:00'), allDay: false, tag: 'jam', participantIds: ['u2', 'u3'], createdBy: 'host', ...overrides,
  };
  return {
    kind: 'event', id: event.id, title: event.title, startAt: event.startAt, allDay: event.allDay, timeLabel: '19:00–21:00',
    tag: 'jam', place: event.location, ownerId: event.createdBy, participantIds: event.participantIds, ownerName: null, event,
  };
}

function renderCard(data: TimelineItem | null, status: 'loading' | 'ready' | 'error' = 'ready') {
  render(<MemoryRouter><NextJamCard next={{ status, data, refresh: vi.fn() }} names={names} now={now} /></MemoryRouter>);
  return screen.getByRole('region', { name: '다음 합주' });
}

describe('NextJamCard', () => {
  it('합주 일정의 날짜·장소·잡은 사람과 함께하는 회원 이름을 보여준다', () => {
    const card = renderCard(eventJam());
    expect(card.textContent).toContain('버스킹 합주');
    expect(card.textContent).toContain('10월 3일 (토) · 19:00–21:00');
    expect(card.textContent).toContain('한강공원');
    expect(card.textContent).toContain('김희나 · 함께: 박드럼, 최베이스');
    expect(screen.getByRole('link', { name: /일정에서 보기/ }).getAttribute('href')).toBe('/schedule?day=2026-10-03');
  });

  it('이미 시작한 합주는 진행 중으로 표시하고, 초대가 없으면 잡은 사람만', () => {
    const card = renderCard(eventJam({ startAt: kstInstant('2026-10-02', '11:30'), endAt: kstInstant('2026-10-02', '13:00'), participantIds: [] }));
    expect(card.textContent).toContain('진행 중 · 10월 2일 (금)');
    expect(card.textContent).toContain('김희나');
    expect(card.textContent).not.toContain('함께');
  });

  it('여러 날 합주는 기간을 그대로, 명부에 없는 작성자는 참여자만 보여준다', () => {
    const jam = eventJam({ createdBy: 'unknown', participantIds: ['u2', 'gone'], endAt: kstInstant('2026-10-04', '10:00') });
    const card = renderCard({ ...jam, timeLabel: '10/3 19:00 – 10/4 10:00' });
    expect(card.textContent).toContain('10/3 19:00 – 10/4 10:00');
    expect(card.textContent).not.toContain('10월 3일 (토)');
    expect(card.textContent).toContain('함께: 회원 2명');
  });

  it('작성자도 참여자도 모르고 장소도 없으면 그 줄을 생략한다', () => {
    const card = renderCard(eventJam({ createdBy: 'unknown', participantIds: [], location: null }));
    expect(card.querySelectorAll('p')).toHaveLength(2);
  });

  it('불러오는 중·없음·실패를 구분한다', () => {
    expect(renderCard(null, 'loading').textContent).toContain('다음 합주를 확인하고 있어요');
    cleanup();
    expect(renderCard(null).textContent).toContain('예정된 합주가 없어요');
    cleanup();
    expect(renderCard(null, 'error').textContent).toContain('합주를 불러오지 못했어요');
  });
});
