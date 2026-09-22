import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

const { fetchDayReservations } = vi.hoisted(() => ({ fetchDayReservations: vi.fn() }));
vi.mock('./repository', () => ({ fetchDayReservations }));

import { useDayReservations } from './useDayReservations';

const dayKey = '2026-09-22';

beforeEach(() => {
  fetchDayReservations.mockReset();
});
afterEach(cleanup);

describe('useDayReservations', () => {
  it('로딩 후 예약을 슬롯 뷰로 노출한다', async () => {
    fetchDayReservations.mockResolvedValue([
      { id: 'r1', ownerId: 'me', slotIds: ['2026-09-22_18-00'], title: 'A', note: null, ownerName: '김', startAt: new Date(), endAt: new Date(), dayKey },
    ]);

    const { result } = renderHook(() => useDayReservations(dayKey, 'me'));
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.slots).toHaveLength(30);
    const mine = result.current.slots.find((s) => s.slotId === '2026-09-22_18-00');
    expect(mine?.status).toBe('mine');
  });

  it('실패하면 error 상태와 메시지를 노출한다', async () => {
    const rejected = Promise.reject(new Error('boom'));
    rejected.catch(() => {});
    fetchDayReservations.mockReturnValue(rejected);

    const { result } = renderHook(() => useDayReservations(dayKey, 'me'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBeTruthy();
  });

  it('refresh로 다시 불러온다', async () => {
    fetchDayReservations.mockResolvedValue([]);
    const { result } = renderHook(() => useDayReservations(dayKey, 'me'));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fetchDayReservations.mockClear();
    await result.current.refresh();
    expect(fetchDayReservations).toHaveBeenCalledWith(dayKey);
  });
});
