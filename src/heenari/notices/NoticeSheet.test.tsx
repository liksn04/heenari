import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  online: { current: true },
}));

vi.mock('./noticeRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./noticeRepository')>();
  return { ...actual, createNotice: h.create, updateNotice: h.update, deleteNotice: h.remove };
});
vi.mock('../reservations/useOnlineStatus', () => ({ useOnlineStatus: () => h.online.current }));

import { NoticeSheet, type NoticeSheetMode } from './NoticeSheet';
import { NoticeValidationError } from './noticeRepository';

const notice = {
  id: 'n1', title: '정기 회의', body: '금요일 19시\n동아리방', authorId: 'admin-x', authorName: '김운영',
  createdAt: new Date('2026-09-24T01:00:00.000Z'), updatedAt: new Date('2026-09-24T01:00:00.000Z'),
};
const author = { uid: 'admin-x', name: '김운영' };
const onClose = vi.fn();
const onChanged = vi.fn();

function renderSheet(mode: NoticeSheetMode, canManage = true) {
  return render(<NoticeSheet mode={mode} canManage={canManage} author={author} onClose={onClose} onChanged={onChanged} />);
}

beforeEach(() => {
  h.create.mockReset().mockResolvedValue('new');
  h.update.mockReset().mockResolvedValue(undefined);
  h.remove.mockReset().mockResolvedValue(undefined);
  h.online.current = true;
  onClose.mockReset();
  onChanged.mockReset();
});

afterEach(cleanup);

describe('NoticeSheet 읽기', () => {
  it('회원에게는 제목·날짜·작성자·본문만 보여주고 관리 버튼은 없다', () => {
    renderSheet({ kind: 'view', notice }, false);
    const dialog = screen.getByRole('dialog', { name: '동아리 공지' });
    expect(dialog.textContent).toContain('정기 회의');
    expect(dialog.textContent).toContain('9월 24일 · 김운영');
    expect(dialog.querySelector('.notice-body')?.textContent).toBe('금요일 19시\n동아리방');
    expect(screen.queryByRole('button', { name: /수정/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /삭제/ })).toBeNull();
  });

  it('닫기 버튼·Esc·바깥 누르기로 닫는다', async () => {
    const user = userEvent.setup();
    const { container } = renderSheet({ kind: 'view', notice }, false);
    await user.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.click(container.querySelector('.modal-overlay')!);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('NoticeSheet 운영진', () => {
  it('새 공지를 써서 올린다', async () => {
    const user = userEvent.setup();
    renderSheet({ kind: 'create' });
    expect(screen.getByRole('dialog', { name: '공지 쓰기' })).toBeTruthy();
    await user.type(screen.getByLabelText('제목'), '가을 공연 안내');
    await user.type(screen.getByLabelText('내용'), '10월 셋째 주');
    await user.click(screen.getByRole('button', { name: '공지 올리기' }));
    expect(h.create).toHaveBeenCalledWith({ title: '가을 공연 안내', body: '10월 셋째 주' }, author);
    expect(onChanged).toHaveBeenCalledWith('공지를 올렸어요.');
  });

  it('수정으로 바꿔 기존 내용을 고친다', async () => {
    const user = userEvent.setup();
    renderSheet({ kind: 'view', notice });
    await user.click(screen.getByRole('button', { name: /수정/ }));
    expect(screen.getByRole('dialog', { name: '공지 수정' })).toBeTruthy();
    const title = screen.getByLabelText('제목') as HTMLInputElement;
    expect(title.value).toBe('정기 회의');
    await user.clear(title);
    await user.type(title, '장소 변경');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(h.update).toHaveBeenCalledWith('n1', { title: '장소 변경', body: '금요일 19시\n동아리방' });
    expect(onChanged).toHaveBeenCalledWith('공지를 고쳤어요.');
  });

  it('삭제는 한 번 더 확인하고, 취소할 수 있다', async () => {
    const user = userEvent.setup();
    renderSheet({ kind: 'view', notice });
    await user.click(screen.getByRole('button', { name: /삭제/ }));
    expect(screen.getByText('이 공지를 삭제할까요? 되돌릴 수 없어요.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(h.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /삭제/ }));
    await user.click(screen.getByRole('button', { name: '삭제 확정' }));
    expect(h.remove).toHaveBeenCalledWith('n1');
    expect(onChanged).toHaveBeenCalledWith('공지를 삭제했어요.');
  });

  it('실패 이유를 알려주고 시트를 유지한다', async () => {
    const user = userEvent.setup();
    h.create.mockRejectedValueOnce(new NoticeValidationError('body'))
      .mockRejectedValueOnce({ code: 'permission-denied' })
      .mockRejectedValueOnce(new Error('offline'));
    renderSheet({ kind: 'create' });
    await user.type(screen.getByLabelText('제목'), '제목');
    const submit = screen.getByRole('button', { name: '공지 올리기' });
    await user.click(submit);
    expect(screen.getByRole('status').textContent).toBe('내용을 1~1000자로 입력해주세요.');
    await user.click(submit);
    expect(screen.getByRole('status').textContent).toBe('공지는 운영진만 쓸 수 있어요.');
    await user.click(submit);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('저장하지 못했어요'));
    await user.type(screen.getByLabelText('내용'), 'x');
    expect(screen.queryByRole('status')).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('삭제 실패는 안내하고 확인 단계를 닫는다', async () => {
    const user = userEvent.setup();
    h.remove.mockRejectedValueOnce(new Error('offline'));
    renderSheet({ kind: 'view', notice });
    await user.click(screen.getByRole('button', { name: /삭제/ }));
    await user.click(screen.getByRole('button', { name: '삭제 확정' }));
    expect(screen.getByRole('status').textContent).toContain('저장하지 못했어요');
    expect(screen.queryByRole('button', { name: '삭제 확정' })).toBeNull();
  });

  it('오프라인이면 저장·수정을 막는다', () => {
    h.online.current = false;
    renderSheet({ kind: 'create' });
    expect(screen.getByText(/오프라인 상태에서는 저장할 수 없어요/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '공지 올리기' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
