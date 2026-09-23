import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  calls: [] as unknown[][],
  docs: [] as { id: string; data: () => Record<string, unknown> }[],
  stored: {} as Record<string, Record<string, unknown>>,
  fail: { current: false },
}));

vi.mock('../lib/firebase', () => ({ getFirebaseDb: vi.fn(async () => ({ __db: true })) }));
vi.mock('firebase/firestore', () => ({
  serverTimestamp: () => '__server',
  doc: (_db: unknown, name: string, id: string) => `${name}/${id}`,
  collection: (_db: unknown, name: string) => name,
  getDoc: vi.fn(async (path: string) => ({ exists: () => path in h.stored, data: () => h.stored[path] })),
  setDoc: vi.fn(async (...args: unknown[]) => { h.calls.push(args); }),
  getDocs: vi.fn(async () => {
    if (h.fail.current) throw new Error('offline');
    return { docs: h.docs };
  }),
}));

import {
  ensureMemberProfile,
  fetchMemberProfile,
  fetchMembers,
  memberName,
  ProfileValidationError,
  updateMemberProfile,
} from './memberRepository';
import { useMembers } from './useMembers';

beforeEach(() => {
  h.calls.length = 0;
  h.docs = [];
  h.stored = {};
  h.fail.current = false;
});

describe('ensureMemberProfile', () => {
  it('처음 로그인하면 Google 이름으로 명부 문서를 만든다', async () => {
    expect(await ensureMemberProfile('u1', '  김희나  ')).toEqual({ name: '김희나', bio: null });
    expect(h.calls[0]).toEqual(['members/u1', { name: '김희나', bio: null, updatedAt: '__server' }]);
  });

  it('이미 있으면 회원이 고친 프로필을 덮어쓰지 않고 돌려준다', async () => {
    h.stored['members/u1'] = { name: '희나', bio: '드럼 좋아요' };
    expect(await ensureMemberProfile('u1', 'Google 이름')).toEqual({ name: '희나', bio: '드럼 좋아요' });
    expect(h.calls).toHaveLength(0);
  });

  it('이름이 빈 기존 문서는 Google 이름으로 보여준다', async () => {
    h.stored['members/u1'] = { name: ' ', bio: ' ' };
    expect(await ensureMemberProfile('u1', '김희나')).toEqual({ name: '김희나', bio: null });
  });

  it('memberName은 빈 이름·긴 이름을 다듬는다', () => {
    expect(memberName('   ')).toBe('회원');
    expect(memberName('가'.repeat(70))).toHaveLength(60);
  });
});

describe('프로필 조회·저장', () => {
  it('내 프로필을 읽고, 없으면 null', async () => {
    h.stored['members/u1'] = { name: '김희나', bio: null };
    expect(await fetchMemberProfile('u1')).toEqual({ name: '김희나', bio: null });
    expect(await fetchMemberProfile('ghost')).toBeNull();
  });

  it('다듬은 프로필 전체를 저장한다', async () => {
    const saved = await updateMemberProfile('u1', { name: ' 희나 ', bio: ' 반가워요 ' });
    expect(saved).toEqual({ name: '희나', bio: '반가워요' });
    expect(h.calls[0]).toEqual(['members/u1', { name: '희나', bio: '반가워요', updatedAt: '__server' }]);
  });

  it('잘못된 프로필은 저장하지 않는다', async () => {
    await expect(updateMemberProfile('u1', { name: '', bio: '' })).rejects.toBeInstanceOf(ProfileValidationError);
    await expect(updateMemberProfile('u1', { name: '희나', bio: '가'.repeat(61) })).rejects.toMatchObject({ reason: 'bio' });
    expect(h.calls).toHaveLength(0);
  });
});

describe('fetchMembers', () => {
  it('명부를 이름순으로 불러온다', async () => {
    h.docs = [
      { id: 'b', data: () => ({ name: '이나리' }) },
      { id: 'a', data: () => ({ name: '김희나' }) },
      { id: 'c', data: () => ({}) },
    ];
    expect(await fetchMembers()).toEqual([
      { uid: 'a', name: '김희나' },
      { uid: 'b', name: '이나리' },
      { uid: 'c', name: '회원' },
    ]);
  });
});

describe('useMembers', () => {
  it('명부와 uid→이름 지도를 준다', async () => {
    h.docs = [{ id: 'a', data: () => ({ name: '김희나' }) }];
    const { result } = renderHook(() => useMembers());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.names.get('a')).toBe('김희나');
  });

  it('불러오지 못하면 오류 상태', async () => {
    h.fail.current = true;
    const { result } = renderHook(() => useMembers());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.members).toEqual([]);
  });
});
