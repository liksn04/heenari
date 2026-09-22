import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReservationView } from './types';

const h = vi.hoisted(() => ({
  cancelReservation: vi.fn(),
  refresh: vi.fn(),
  state: {
    current: null as unknown as { status: string; reservations: ReservationView[]; error: string | null; refresh: () => Promise<void> },
  },
}));

vi.mock('./useMyUpcomingReservations', () => ({ useMyUpcomingReservations: () => h.state.current }));
vi.mock('./repository', () => ({ cancelReservation: h.cancelReservation }));

import { ReservationList } from './ReservationList';

const viewer = { uid: 'me' };

function view(id: string, title: string): ReservationView {
  return {
    id,
    title,
    note: null,
    ownerId: 'me',
    ownerName: '김희나',
    startAt: new Date('2026-09-22T09:00:00.000Z'),
    endAt: new Date('2026-09-22T10:00:00.000Z'),
    dayKey: '2026-09-22',
    slotIds: ['2026-09-22_18-00', '2026-09-22_18-30'],
  };
}

beforeEach(() => {
  h.cancelReservation.mockReset().mockResolvedValue(undefined);
  h.refresh.mockReset().mockResolvedValue(undefined);
  h.state.current = { status: 'ready', reservations: [], error: null, refresh: h.refresh };
});
afterEach(cleanup);

describe('ReservationList', () => {
  it('예약이 없으면 빈 상태를 보여준다', () => {
    render(<ReservationList viewer={viewer} />);
    expect(screen.getByText('예정된 예약이 없어요')).toBeTruthy();
  });

  it('예약 항목의 시간(Asia/Seoul)과 제목을 보여준다', () => {
    h.state.current = { status: 'ready', reservations: [view('r1', '보컬 연습')], error: null, refresh: h.refresh };
    render(<ReservationList viewer={viewer} />);
    expect(screen.getByText('보컬 연습')).toBeTruthy();
    expect(screen.getByText('2026-09-22 · 18:00–19:00')).toBeTruthy();
  });

  it('취소하면 cancelReservation과 refresh를 호출한다', async () => {
    const user = userEvent.setup();
    h.state.current = { status: 'ready', reservations: [view('r1', '보컬 연습')], error: null, refresh: h.refresh };
    render(<ReservationList viewer={viewer} />);

    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(h.cancelReservation).toHaveBeenCalledWith({ reservationId: 'r1', viewerId: 'me' }));
    expect(h.refresh).toHaveBeenCalled();
  });

  it('취소 실패 시 안내를 보여준다', async () => {
    const user = userEvent.setup();
    h.cancelReservation.mockRejectedValue(new Error('nope'));
    h.state.current = { status: 'ready', reservations: [view('r1', '보컬 연습')], error: null, refresh: h.refresh };
    render(<ReservationList viewer={viewer} />);

    await user.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.getByText(/취소하지 못했어요/)).toBeTruthy());
  });
});
