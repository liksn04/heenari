import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('./memberRepository', () => ({ fetchMemberProfile: h.fetch }));

import { useMyProfile } from './useMyProfile';

describe('useMyProfile', () => {
  it('내 프로필을 불러오고, 저장 결과로 바로 바꿀 수 있다', async () => {
    h.fetch.mockResolvedValueOnce({ name: '김희나', bio: null });
    const { result } = renderHook(() => useMyProfile('u1'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.profile?.name).toBe('김희나'));
    act(() => result.current.replace({ name: '희나', bio: null }));
    expect(result.current.profile).toEqual({ name: '희나', bio: null });
  });

  it('불러오지 못하면 오류 상태', async () => {
    h.fetch.mockRejectedValueOnce(new Error('x'));
    const { result } = renderHook(() => useMyProfile('u1'));
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
