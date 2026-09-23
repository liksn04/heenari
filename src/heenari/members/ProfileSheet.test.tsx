import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  update: vi.fn(),
  online: { current: true },
  members: [] as { uid: string; name: string }[],
}));

vi.mock('./memberRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./memberRepository')>();
  return { ...actual, updateMemberProfile: h.update };
});
vi.mock('./useMembers', () => ({ useMembers: () => ({ status: 'ready', members: h.members, names: new Map() }) }));
vi.mock('../reservations/useOnlineStatus', () => ({ useOnlineStatus: () => h.online.current }));

import { ProfileSheet } from './ProfileSheet';
import { ProfileValidationError } from './memberRepository';

const onClose = vi.fn();
const onSaved = vi.fn();
const initial = { name: '김희나', bio: null };

function renderSheet() {
  return render(<ProfileSheet uid="me" initial={initial} onClose={onClose} onSaved={onSaved} />);
}

beforeEach(() => {
  h.update.mockReset().mockImplementation(async (_uid: string, input: { name: string; bio: string }) => ({
    name: input.name.trim(), bio: input.bio.trim() || null,
  }));
  h.online.current = true;
  h.members = [{ uid: 'me', name: '김희나' }, { uid: 'u2', name: '이나리' }];
  onClose.mockReset();
  onSaved.mockReset();
});

afterEach(cleanup);

describe('ProfileSheet', () => {
  it('현재 프로필을 채우고, 고친 이름·소개를 저장한다(담당 세션은 없다)', async () => {
    const user = userEvent.setup();
    renderSheet();
    const name = screen.getByLabelText('이름') as HTMLInputElement;
    expect(name.value).toBe('김희나');
    expect(screen.queryByText(/담당 세션/)).toBeNull();
    await user.clear(name);
    await user.type(name, '희나');
    await user.type(screen.getByLabelText('한줄소개 (선택)'), '주말 합주 환영');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ name: '희나', bio: '주말 합주 환영' }));
    expect(h.update).toHaveBeenCalledWith('me', { name: '희나', bio: '주말 합주 환영' });
  });

  it('같은 이름의 회원이 있으면 동명이인 확인 전까지 저장할 수 없다', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.clear(screen.getByLabelText('이름'));
    await user.type(screen.getByLabelText('이름'), '이나리');
    const save = screen.getByRole('button', { name: '저장' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /동명이인이 맞아요/ }));
    expect(save.disabled).toBe(false);
    // 이름을 다시 바꾸면 확인도 다시 받는다.
    await user.type(screen.getByLabelText('이름'), '2');
    expect(screen.queryByRole('checkbox', { name: /동명이인/ })).toBeNull();
    await user.clear(screen.getByLabelText('이름'));
    await user.type(screen.getByLabelText('이름'), '이나리');
    expect((screen.getByRole('checkbox', { name: /동명이인/ }) as HTMLInputElement).checked).toBe(false);
  });

  it('내 이름 그대로는 동명이인이 아니다', () => {
    renderSheet();
    expect(screen.queryByRole('checkbox', { name: /동명이인/ })).toBeNull();
  });

  it('검증·저장 오류를 알려주고 입력하면 지운다', async () => {
    h.update.mockRejectedValueOnce(new ProfileValidationError('name')).mockRejectedValueOnce(new ProfileValidationError('bio')).mockRejectedValueOnce(new Error('x'));
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect((await screen.findByRole('status')).textContent).toBe('이름을 1~20자로 입력해주세요.');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('한줄소개는 60자 이하로 입력해주세요.'));
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('저장하지 못했어요'));
    await user.type(screen.getByLabelText('이름'), '!');
    expect(screen.queryByRole('status')).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('오프라인이면 저장을 막고, 닫기·배경·Escape로 닫는다', async () => {
    h.online.current = false;
    const { container } = renderSheet();
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('오프라인 상태에서는 저장할 수 없어요.')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(container.querySelector('.modal-overlay') as Element);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('한줄소개 입력도 오류를 지운다', async () => {
    h.update.mockRejectedValueOnce(new Error('x'));
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('status');
    await user.type(screen.getByLabelText('한줄소개 (선택)'), '안');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
