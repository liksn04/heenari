import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DaySlotView } from './types';

const h = vi.hoisted(() => ({
  createReservation: vi.fn(),
  refresh: vi.fn(),
  hook: { current: null as unknown as { slots: DaySlotView[]; status: string; reservations: unknown[]; error: string | null; refresh: () => Promise<void> } },
}));

vi.mock('./useDayReservations', () => ({ useDayReservations: () => h.hook.current }));
vi.mock('./repository', async (importActual) => {
  const actual = await importActual<typeof import('./repository')>();
  return { ...actual, createReservation: h.createReservation };
});

import { ReservationForm } from './ReservationForm';
import { SlotConflictError } from './repository';

const viewer = { uid: 'me', name: '김희나' };

function makeSlots(): DaySlotView[] {
  return [
    { slotId: '2026-09-22_09-00', label: '09:00', status: 'past', reservationId: null },
    { slotId: '2026-09-22_18-00', label: '18:00', status: 'available', reservationId: null },
    { slotId: '2026-09-22_18-30', label: '18:30', status: 'available', reservationId: null },
    { slotId: '2026-09-22_19-00', label: '19:00', status: 'reserved', reservationId: 'r2' },
    { slotId: '2026-09-22_19-30', label: '19:30', status: 'mine', reservationId: 'r1' },
    { slotId: '2026-09-22_20-30', label: '20:30', status: 'available', reservationId: null },
  ];
}

const slotButton = (label: string) => screen.getByRole('button', { name: new RegExp(label) });
const cta = () => screen.getByRole('group', { name: '예약 확정' });

beforeEach(() => {
  h.createReservation.mockReset();
  h.refresh.mockReset().mockResolvedValue(undefined);
  h.hook.current = { slots: makeSlots(), status: 'ready', reservations: [], error: null, refresh: h.refresh };
});
afterEach(cleanup);

describe('ReservationForm', () => {
  it('슬롯 상태를 색상 외 텍스트로 표시한다', () => {
    render(<ReservationForm viewer={viewer} dayKey="2026-09-22" />);
    expect(screen.getAllByText('예약 가능').length).toBeGreaterThan(0);
    expect(screen.getByText('예약됨')).toBeTruthy();
    expect(screen.getByText('내 예약')).toBeTruthy();
    expect(screen.getByText('지난 시간')).toBeTruthy();
  });

  it('예약됨/지난 슬롯은 비활성이고 빈 슬롯만 누를 수 있다', () => {
    render(<ReservationForm viewer={viewer} dayKey="2026-09-22" />);
    expect(slotButton('19:00').hasAttribute('disabled')).toBe(true); // reserved
    expect(slotButton('09:00').hasAttribute('disabled')).toBe(true); // past
    expect(slotButton('18:00').hasAttribute('disabled')).toBe(false);
  });

  it('연속 선택은 범위를 넓히고 CTA에 요약을 보여준다', async () => {
    const user = userEvent.setup();
    render(<ReservationForm viewer={viewer} dayKey="2026-09-22" />);

    await user.click(slotButton('18:00'));
    expect(within(cta()).getByText('18:00–18:30')).toBeTruthy();
    expect(within(cta()).getByText('30분')).toBeTruthy();

    await user.click(slotButton('18:30'));
    expect(within(cta()).getByText('18:00–19:00')).toBeTruthy();
    expect(within(cta()).getByText('60분')).toBeTruthy();
  });

  it('비연속 슬롯을 누르면 선택을 초기화한다', async () => {
    const user = userEvent.setup();
    render(<ReservationForm viewer={viewer} dayKey="2026-09-22" />);

    await user.click(slotButton('18:00'));
    await user.click(slotButton('18:30'));
    await user.click(slotButton('20:30')); // 비연속
    expect(within(cta()).getByText('20:30–21:00')).toBeTruthy();
    expect(within(cta()).queryByText('18:00–19:00')).toBeNull();
  });

  it('충돌 시 안내를 보여주고 선택을 보존하며 새로고침한다', async () => {
    const user = userEvent.setup();
    h.createReservation.mockRejectedValue(new SlotConflictError());
    render(<ReservationForm viewer={viewer} dayKey="2026-09-22" />);

    await user.click(slotButton('18:00'));
    await user.type(screen.getByRole('textbox', { name: '예약 제목' }), '합주');
    await user.click(screen.getByRole('button', { name: '예약 확정' }));

    await waitFor(() => expect(screen.getByText('방금 다른 회원이 이 시간을 예약했어요.')).toBeTruthy());
    expect(within(cta()).getByText('18:00–18:30')).toBeTruthy(); // 선택 보존
    expect(h.refresh).toHaveBeenCalled();
  });

  it('네트워크 실패 시 성공으로 표시하지 않는다', async () => {
    const user = userEvent.setup();
    h.createReservation.mockRejectedValue(new Error('network down'));
    render(<ReservationForm viewer={viewer} dayKey="2026-09-22" />);

    await user.click(slotButton('18:00'));
    await user.type(screen.getByRole('textbox', { name: '예약 제목' }), '합주');
    await user.click(screen.getByRole('button', { name: '예약 확정' }));

    await waitFor(() => expect(screen.getByText(/예약을 확정하지 못했어요/)).toBeTruthy());
    expect(screen.queryByText('예약이 확정됐어요.')).toBeNull();
  });

  it('예약에 성공하면 확정 안내를 보이고 선택을 비운다', async () => {
    const user = userEvent.setup();
    h.createReservation.mockResolvedValue('new-id');
    render(<ReservationForm viewer={viewer} dayKey="2026-09-22" />);

    await user.click(slotButton('18:00'));
    await user.type(screen.getByRole('textbox', { name: '예약 제목' }), '합주');
    await user.click(screen.getByRole('button', { name: '예약 확정' }));

    await waitFor(() => expect(screen.getByText('예약이 확정됐어요.')).toBeTruthy());
    expect(within(cta()).getByText(/슬롯을 선택하세요/)).toBeTruthy(); // 선택 비워짐
  });

  it('오프라인이면 예약을 확정할 수 없다', async () => {
    const user = userEvent.setup();
    render(<ReservationForm viewer={viewer} dayKey="2026-09-22" />);
    await user.click(slotButton('18:00'));
    await user.type(screen.getByRole('textbox', { name: '예약 제목' }), '합주');

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(within(cta()).getByText(/오프라인 상태에서는 예약할 수 없어요/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '예약 확정' }).hasAttribute('disabled')).toBe(true);
  });
});
