import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./ReservationModal', () => ({
  ReservationModal: ({ dayKey, onClose, onCreated }: { dayKey: string; onClose: () => void; onCreated: () => void }) => (
    <div role="dialog" aria-label={`${dayKey} 예약`}>
      <button type="button" onClick={onCreated}>확정 테스트</button>
      <button type="button" onClick={onClose}>닫기 테스트</button>
    </div>
  ),
}));

import { ReservationScheduler } from './ReservationScheduler';

const viewer = { uid: 'me', name: '김희나' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-22T02:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('ReservationScheduler', () => {
  it('날짜 선택 전에는 예약하기가 비활성이다', () => {
    render(<ReservationScheduler viewer={viewer} />);
    const cta = screen.getByRole('button', { name: '날짜를 선택하세요' });
    expect(cta.hasAttribute('disabled')).toBe(true);
  });

  it('날짜를 고르면 모달을 열고, 확정 시 닫히며 안내를 보여준다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ReservationScheduler viewer={viewer} />);

    await user.click(screen.getByRole('button', { name: '2026-09-25' }));
    const cta = screen.getByRole('button', { name: '2026-09-25 예약하기' });
    expect(cta.hasAttribute('disabled')).toBe(false);

    await user.click(cta);
    expect(screen.getByRole('dialog', { name: '2026-09-25 예약' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '확정 테스트' }));
    expect(screen.queryByRole('dialog')).toBeNull(); // 모달 닫힘
    expect(screen.getByText('2026-09-25 예약이 확정됐어요.')).toBeTruthy();
  });
});
