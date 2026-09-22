import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReservationCalendar } from './ReservationCalendar';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-22T02:00:00.000Z')); // 2026-09-22 11:00 KST
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('ReservationCalendar', () => {
  it('현재 달을 보여주고 이전 달로는 못 간다', () => {
    render(<ReservationCalendar selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText('2026년 9월')).toBeTruthy();
    expect(screen.getByRole('button', { name: '이전 달' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '다음 달' }).hasAttribute('disabled')).toBe(false);
  });

  it('지난 날짜는 선택할 수 없고 미래 날짜는 선택된다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSelect = vi.fn();
    render(<ReservationCalendar selected={null} onSelect={onSelect} />);

    expect(screen.getByRole('button', { name: '2026-09-10' }).hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: '2026-09-25' }));
    expect(onSelect).toHaveBeenCalledWith('2026-09-25');
  });

  it('다음 달로 이동한다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ReservationCalendar selected={null} onSelect={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByText('2026년 10월')).toBeTruthy();
  });

  it('선택한 날짜를 표시한다', () => {
    render(<ReservationCalendar selected="2026-09-25" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: '2026-09-25' }).getAttribute('data-selected')).toBe('true');
  });
});
