import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { InviteePicker } from './InviteePicker';
import type { MemberView } from './memberRepository';

afterEach(cleanup);

const members: MemberView[] = [
  { uid: 'me', name: '김희나' },
  { uid: 'u2', name: '이나리' },
  { uid: 'u3', name: '박드럼' },
  { uid: 'u4', name: '박베이스' },
];

function Harness({ initial = [] as string[], list = members, status = 'ready' as const, max = 20 }) {
  const [selected, setSelected] = useState(initial);
  return (
    <>
      <InviteePicker members={list} status={status} selected={selected} currentUserId="me" max={max} onChange={setSelected} />
      <output data-testid="value">{selected.join(',')}</output>
    </>
  );
}

describe('InviteePicker', () => {
  it('검색창과 나를 뺀 회원 목록을 보여준다', () => {
    render(<Harness />);
    expect(screen.getByRole('searchbox', { name: '회원 이름으로 검색' })).toBeTruthy();
    const list = screen.getByRole('list', { name: '초대할 회원' });
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['이이나리', '박박드럼', '박박베이스']);
  });

  it('이름으로 거르고, 결과가 없으면 알려준다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('searchbox'), '박');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), '없는사람');
    expect(screen.getByText('검색 결과가 없어요.')).toBeTruthy();
  });

  it('누르면 선택·해제되고 선택 수를 보여준다. 검색해도 선택은 유지된다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('checkbox', { name: '이나리' }));
    await user.click(screen.getByRole('checkbox', { name: '박드럼' }));
    expect(screen.getByText('2명 선택됨')).toBeTruthy();
    await user.type(screen.getByRole('searchbox'), '베이스');
    expect(screen.getByTestId('value').textContent).toBe('u2,u3');
    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('checkbox', { name: '이나리' }));
    expect(screen.getByTestId('value').textContent).toBe('u3');
    expect(screen.getByText('1명 선택됨')).toBeTruthy();
  });

  it('키보드(스페이스)로도 고를 수 있다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('checkbox', { name: '이나리' }).focus();
    await user.keyboard(' ');
    expect(screen.getByTestId('value').textContent).toBe('u2');
  });

  it('최대 인원을 채우면 나머지는 고를 수 없다', async () => {
    const user = userEvent.setup();
    render(<Harness max={1} />);
    await user.click(screen.getByRole('checkbox', { name: '이나리' }));
    expect((screen.getByRole('checkbox', { name: '박드럼' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox', { name: '이나리' }) as HTMLInputElement).disabled).toBe(false);
  });

  it('불러오는 중·실패·초대할 회원 없음을 안내한다', () => {
    const { rerender } = render(<InviteePicker members={[]} status="loading" selected={[]} currentUserId="me" onChange={vi.fn()} />);
    expect(screen.getByText('회원 목록을 불러오고 있어요…')).toBeTruthy();
    rerender(<InviteePicker members={[]} status="error" selected={[]} currentUserId="me" onChange={vi.fn()} />);
    expect(screen.getByText(/회원 목록을 불러오지 못했어요/)).toBeTruthy();
    rerender(<InviteePicker members={[members[0]]} status="ready" selected={[]} currentUserId="me" onChange={vi.fn()} />);
    expect(screen.getByText(/초대할 수 있는 회원이 없어요/)).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});
