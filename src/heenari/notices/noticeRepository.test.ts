import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// 실제 Firestore 대신 호출만 기록해 배선을 검증한다.
const h = vi.hoisted(() => ({
  calls: [] as { op: string; args: unknown[] }[],
  docs: [] as { id: string; data: () => Record<string, unknown> }[],
  fail: { current: false },
}));

vi.mock('../lib/firebase', () => ({ getFirebaseDb: vi.fn(async () => ({ __db: true })) }));
vi.mock('firebase/firestore', () => ({
  serverTimestamp: () => '__server',
  collection: (_db: unknown, name: string) => ({ __collection: name }),
  doc: (...args: unknown[]) => (args.length === 1 ? { id: 'auto-1' } : { __doc: `${args[1]}/${args[2]}` }),
  orderBy: (field: string, dir: string) => ({ __orderBy: [field, dir] }),
  limit: (count: number) => ({ __limit: count }),
  query: (coll: unknown, ...clauses: unknown[]) => ({ coll, clauses }),
  getDocs: vi.fn(async (...args: unknown[]) => {
    h.calls.push({ op: 'getDocs', args });
    if (h.fail.current) throw new Error('offline');
    return { docs: h.docs };
  }),
  setDoc: vi.fn(async (...args: unknown[]) => { h.calls.push({ op: 'setDoc', args }); }),
  updateDoc: vi.fn(async (...args: unknown[]) => { h.calls.push({ op: 'updateDoc', args }); }),
  deleteDoc: vi.fn(async (...args: unknown[]) => { h.calls.push({ op: 'deleteDoc', args }); }),
}));

import { createNotice, deleteNotice, fetchNotices, mapNoticeSnapshot, NoticeValidationError, updateNotice } from './noticeRepository';
import { useNotices } from './useNotices';

const created = new Date('2026-09-24T01:00:00.000Z');

beforeEach(() => {
  h.calls.length = 0;
  h.docs = [];
  h.fail.current = false;
});

describe('공지 조회', () => {
  it('최신순으로 제한 개수만 읽고 Timestamp를 Date로 바꾼다', async () => {
    h.docs = [{ id: 'n1', data: () => ({ title: '회의', body: '금요일', authorId: 'a', authorName: '운영진', createdAt: { toDate: () => created }, updatedAt: created }) }];
    const notices = await fetchNotices(3);
    expect(notices).toEqual([{ id: 'n1', title: '회의', body: '금요일', authorId: 'a', authorName: '운영진', createdAt: created, updatedAt: created }]);
    expect(h.calls[0].args[0]).toEqual({ coll: { __collection: 'notices' }, clauses: [{ __orderBy: ['createdAt', 'desc'] }, { __limit: 3 }] });
  });

  it('아직 서버 시각이 없는 방금 쓴 공지는 지금 시각으로 보여준다', () => {
    const view = mapNoticeSnapshot({ id: 'n2', data: () => ({ title: 't', body: 'b', authorId: 'a', authorName: 'n', createdAt: null }) });
    expect(view.createdAt).toBeInstanceOf(Date);
    expect(mapNoticeSnapshot({ id: 'x', data: () => undefined }).id).toBe('x');
  });

  it('useNotices는 불러온 공지를 담고 실패하면 오류 상태', async () => {
    h.docs = [{ id: 'n1', data: () => ({ title: '회의', body: 'b', authorId: 'a', authorName: 'n', createdAt: created, updatedAt: created }) }];
    const ok = renderHook(() => useNotices(3));
    await waitFor(() => expect(ok.result.current.status).toBe('ready'));
    expect(ok.result.current.data.map((notice) => notice.id)).toEqual(['n1']);
    h.fail.current = true;
    const failed = renderHook(() => useNotices(50));
    await waitFor(() => expect(failed.result.current.status).toBe('error'));
  });
});

describe('공지 쓰기', () => {
  it('createNotice는 다듬은 제목·내용과 작성자, 서버 시각을 쓴다', async () => {
    const id = await createNotice({ title: '  회의  ', body: '\n금요일 19시\n동아리방\n' }, { uid: 'admin-x', name: '  김운영 ' });
    expect(id).toBe('auto-1');
    expect(h.calls[0]).toEqual({
      op: 'setDoc',
      args: [{ id: 'auto-1' }, { title: '회의', body: '금요일 19시\n동아리방', authorId: 'admin-x', authorName: '김운영', createdAt: '__server', updatedAt: '__server' }],
    });
  });

  it('updateNotice는 제목·내용과 수정 시각만, deleteNotice는 문서를 지운다', async () => {
    await updateNotice('n1', { title: '장소 변경', body: '301호' });
    await deleteNotice('n1');
    expect(h.calls).toEqual([
      { op: 'updateDoc', args: [{ __doc: 'notices/n1' }, { title: '장소 변경', body: '301호', updatedAt: '__server' }] },
      { op: 'deleteDoc', args: [{ __doc: 'notices/n1' }] },
    ]);
  });

  it('검증에 걸리면 쓰지 않고 이유를 알려준다', async () => {
    await expect(createNotice({ title: ' ', body: 'b' }, { uid: 'a', name: 'n' })).rejects.toMatchObject({ reason: 'title' });
    await expect(updateNotice('n1', { title: 't', body: '' })).rejects.toBeInstanceOf(NoticeValidationError);
    expect(h.calls).toHaveLength(0);
  });
});
