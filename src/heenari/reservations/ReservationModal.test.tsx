import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./ReservationForm', () => ({
  ReservationForm: ({ dayKey }: { dayKey: string }) => <div>form for {dayKey}</div>,
}));

import { ReservationModal } from './ReservationModal';

const viewer = { uid: 'me', name: '김희나' };

afterEach(cleanup);

describe('ReservationModal', () => {
  it('선택한 날짜의 예약 폼을 다이얼로그로 보여준다', () => {
    render(<ReservationModal viewer={viewer} dayKey="2026-09-25" onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: '2026-09-25 예약' })).toBeTruthy();
    expect(screen.getByText('form for 2026-09-25')).toBeTruthy();
  });

  it('닫기 버튼과 Esc로 닫는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ReservationModal viewer={viewer} dayKey="2026-09-25" onClose={onClose} onCreated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('바깥 영역을 누르면 닫히고 시트 내부는 유지된다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ReservationModal viewer={viewer} dayKey="2026-09-25" onClose={onClose} onCreated={vi.fn()} />);

    await user.click(screen.getByRole('dialog')); // 시트 내부
    expect(onClose).not.toHaveBeenCalled();
  });
});
