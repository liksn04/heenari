import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const { fetchMyUpcomingReservations } = vi.hoisted(() => ({ fetchMyUpcomingReservations: vi.fn() }));
vi.mock('./repository', () => ({ fetchMyUpcomingReservations }));

import { useMyUpcomingReservations } from './useMyUpcomingReservations';

beforeEach(() => fetchMyUpcomingReservations.mockReset());
afterEach(cleanup);

describe('useMyUpcomingReservations', () => {
  it('내 예정 예약을 불러온다', async () => {
    fetchMyUpcomingReservations.mockResolvedValue([{ id: 'r1' }]);
    const { result } = renderHook(() => useMyUpcomingReservations('me'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.reservations).toHaveLength(1);
  });

  it('실패하면 error 상태가 된다', async () => {
    fetchMyUpcomingReservations.mockResolvedValueOnce([]); // 마운트는 성공
    const { result } = renderHook(() => useMyUpcomingReservations('me'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fetchMyUpcomingReservations.mockImplementationOnce(() => Promise.reject(new Error('x')));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBeTruthy();
  });

  it('refresh로 다시 조회한다', async () => {
    fetchMyUpcomingReservations.mockResolvedValue([]);
    const { result } = renderHook(() => useMyUpcomingReservations('me'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    fetchMyUpcomingReservations.mockClear();
    await result.current.refresh();
    expect(fetchMyUpcomingReservations).toHaveBeenCalledWith('me');
  });
});
