import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { NoticeView } from './notice';

const h = vi.hoisted(() => ({
  role: 'member' as 'member' | 'admin',
  state: { status: 'ready' as 'loading' | 'ready' | 'error', data: [] as NoticeView[] },
  refresh: vi.fn(),
  calls: [] as [number, number][],
}));

vi.mock('../auth/authState', () => ({
  useHeenariAuth: () => ({ user: { uid: 'admin-x' }, member: { name: '김운영', role: h.role } }),
}));
vi.mock('./useNotices', () => ({
  useNotices: (max: number, version: number) => {
    h.calls.push([max, version]);
    return { ...h.state, refresh: h.refresh };
  },
}));
vi.mock('./NoticeSheet', () => ({
  NoticeSheet: ({ mode, onChanged, onClose }: { mode: { kind: string; notice?: NoticeView }; onChanged: (m: string) => void; onClose: () => void }) => (
    <div role="dialog" aria-label={mode.kind === 'create' ? '공지 쓰기' : mode.notice?.title}>
      <button type="button" onClick={() => onChanged('공지를 올렸어요.')}>완료</button>
      <button type="button" onClick={onClose}>닫기</button>
    </div>
  ),
}));

import { NoticeBoard } from './NoticeBoard';

const day = new Date('2026-09-24T01:00:00.000Z');
const notice = (id: string, title: string): NoticeView => ({ id, title, body: 'b', authorId: 'a', authorName: '김운영', createdAt: day, updatedAt: day });

function renderBoard(variant: 'home' | 'page' = 'home') {
  return render(<MemoryRouter><NoticeBoard variant={variant} /></MemoryRouter>);
}

beforeEach(() => {
  h.role = 'member';
  h.state = { status: 'ready', data: [] };
  h.refresh.mockReset();
  h.calls.length = 0;
});

afterEach(cleanup);

describe('NoticeBoard', () => {
  it('홈은 최신 3개를 요청하고 전체 보기 링크를 둔다. 회원에게는 쓰기 버튼이 없다', () => {
    h.state.data = [notice('n1', '정기 회의'), notice('n2', '회비 안내')];
    renderBoard();
    expect(h.calls[0]).toEqual([3, 0]);
    const list = screen.getByRole('list', { name: '공지 목록' });
    expect(list.textContent).toContain('정기 회의');
    expect(list.textContent).toContain('9월 24일 · 김운영');
    expect(screen.getByRole('link', { name: '공지 전체 보기' }).getAttribute('href')).toBe('/notices');
    expect(screen.queryByRole('button', { name: /공지 쓰기/ })).toBeNull();
  });

  it('공지를 누르면 읽기 시트가 열리고 닫힌다', async () => {
    const user = userEvent.setup();
    h.state.data = [notice('n1', '정기 회의')];
    renderBoard();
    await user.click(screen.getByRole('button', { name: /정기 회의/ }));
    expect(screen.getByRole('dialog', { name: '정기 회의' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('공지 화면은 전체를 요청하고 홈으로 돌아가는 링크를 둔다', () => {
    renderBoard('page');
    expect(h.calls[0]).toEqual([50, 0]);
    expect(screen.getByRole('heading', { level: 1, name: '동아리 공지' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '홈으로' }).getAttribute('href')).toBe('/');
  });

  it('운영진은 공지를 쓰고, 올리면 안내 후 목록을 다시 불러온다', async () => {
    const user = userEvent.setup();
    h.role = 'admin';
    renderBoard();
    await user.click(screen.getByRole('button', { name: /공지 쓰기/ }));
    await user.click(screen.getByRole('button', { name: '완료' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('공지를 올렸어요.');
    expect(h.calls.at(-1)).toEqual([3, 1]);
  });

  it('불러오는 중·없음·실패를 구분하고 다시 시도할 수 있다', async () => {
    h.state = { status: 'loading', data: [] };
    const { rerender } = renderBoard();
    expect(screen.getByText('공지를 확인하고 있어요')).toBeTruthy();
    h.state = { status: 'ready', data: [] };
    rerender(<MemoryRouter><NoticeBoard variant="home" /></MemoryRouter>);
    expect(screen.getByText('아직 올라온 공지가 없어요')).toBeTruthy();
    h.state = { status: 'error', data: [] };
    rerender(<MemoryRouter><NoticeBoard variant="home" /></MemoryRouter>);
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }));
    expect(h.refresh).toHaveBeenCalledOnce();
  });
});
