import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { kstInstant } from './eventPolicy';
import type { ClubEventView } from './types';
import type { ReservationView } from '../reservations/types';

const m = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  createReservation: vi.fn(),
  rescheduleReservation: vi.fn(),
  cancelReservation: vi.fn(),
  online: { current: true },
  members: { status: 'ready' as 'loading' | 'ready' | 'error', members: [] as { uid: string; name: string }[] },
}));

vi.mock('../members/useMembers', () => ({
  useMembers: () => ({ ...m.members, names: new Map(m.members.members.map((member) => [member.uid, member.name])) }),
}));

vi.mock('./eventRepository', () => ({
  createEvent: m.createEvent,
  updateEvent: m.updateEvent,
  deleteEvent: m.deleteEvent,
}));

vi.mock('../reservations/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../reservations/repository')>();
  return {
    ...actual,
    createReservation: m.createReservation,
    rescheduleReservation: m.rescheduleReservation,
    cancelReservation: m.cancelReservation,
  };
});

vi.mock('../reservations/useOnlineStatus', () => ({ useOnlineStatus: () => m.online.current }));

import { EntrySheet, type EntrySheetMode } from './EntrySheet';
import { PastReservationError, ReservationValidationError, SlotConflictError } from '../reservations/repository';
import { EventValidationError } from './eventPolicy';

const viewer = { uid: 'u1', name: '김희나' };
const onClose = vi.fn();
const onSaved = vi.fn();
const onStale = vi.fn();

const myReservation: ReservationView = {
  id: 'r1', title: '보컬 연습', note: '마이크', ownerId: 'u1', ownerName: '김희나',
  startAt: kstInstant('2030-01-01', '18:00'), endAt: kstInstant('2030-01-01', '19:00'),
  dayKey: '2030-01-01', slotIds: ['2030-01-01_18-00', '2030-01-01_18-30'], tag: 'lesson', participantIds: [],
};

const myEvent: ClubEventView = {
  id: 'e1', title: '가을 공연', description: null, location: '대강당',
  startAt: kstInstant('2030-01-02', '19:00'), endAt: kstInstant('2030-01-02', '21:00'), allDay: false, tag: 'lesson', participantIds: [], createdBy: 'u1',
};

function renderSheet(mode: EntrySheetMode = { kind: 'create', dayKey: '2030-01-01' }) {
  return render(<EntrySheet mode={mode} viewer={viewer} onClose={onClose} onSaved={onSaved} onStale={onStale} />);
}

beforeEach(() => {
  for (const fn of [m.createEvent, m.updateEvent, m.deleteEvent, m.createReservation, m.rescheduleReservation, m.cancelReservation]) {
    fn.mockReset().mockResolvedValue(undefined);
  }
  m.online.current = true;
  m.members = { status: 'ready', members: [{ uid: 'u1', name: '김희나' }, { uid: 'u2', name: '이나리' }, { uid: 'u3', name: '박드럼' }] };
  onClose.mockReset();
  onSaved.mockReset();
  onStale.mockReset();
});

afterEach(cleanup);

describe('EntrySheet 추가', () => {
  it('기본은 동아리방·합주 1시간: 같은 모달로 저장하면 30분 슬롯 예약이 된다', async () => {
    const user = userEvent.setup();
    renderSheet();
    expect(screen.getByRole('button', { name: '동아리방' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '합주' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/합주는 30분 단위로 최대 1시간/)).toBeTruthy();
    await user.type(screen.getByLabelText('제목'), '합주');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('일정을 추가했어요.'));
    expect(m.createReservation).toHaveBeenCalledWith({
      draft: { title: '합주', note: null, tag: 'jam', participantIds: [], slotIds: ['2030-01-01_18-00', '2030-01-01_18-30'] },
      ownerId: 'u1',
      ownerName: '김희나',
    });
    expect(m.createEvent).not.toHaveBeenCalled();
  });

  it('다른 장소를 고르면 같은 모달로 일반 일정이 된다', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(screen.getByLabelText('제목'), '공연');
    await user.click(screen.getByRole('button', { name: '다른 장소' }));
    expect(screen.getByText('동아리방 시간은 잡아두지 않아요.')).toBeTruthy();
    await user.type(screen.getByLabelText('장소 이름 (선택)'), '대강당');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(m.createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: '공연', location: '대강당', allDay: false }), 'u1');
    expect(m.createReservation).not.toHaveBeenCalled();
  });

  it('동아리방 종일은 잠그지 않는 일정으로 저장한다', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.type(screen.getByLabelText('제목'), '준비 주간');
    await user.click(screen.getByRole('checkbox', { name: '종일' }));
    expect(screen.queryByLabelText('시작 시각')).toBeNull();
    expect(screen.getByText('종일 일정은 동아리방 시간을 잡아두지 않아요.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(m.createEvent).toHaveBeenCalledWith(expect.objectContaining({ allDay: true, location: '동아리방' }), 'u1'));
  });

  it('동아리방은 30분 단위 드롭다운으로 시간을 고르고 종료 날짜는 받지 않는다', async () => {
    const user = userEvent.setup();
    renderSheet();
    const start = screen.getByLabelText('시작 시각') as HTMLSelectElement;
    const end = screen.getByLabelText('종료 시각') as HTMLSelectElement;
    expect(start.tagName).toBe('SELECT');
    expect([...start.options].map((option) => option.value).slice(0, 3)).toEqual(['09:00', '09:30', '10:00']);
    expect(start.options).toHaveLength(30);
    expect(screen.queryByLabelText('종료 날짜')).toBeNull();

    await user.selectOptions(start, '23:30');
    expect(end.value).toBe('00:00');
    expect([...end.options].map((option) => option.textContent)).toEqual(['24:00 (30분)']);

    await user.type(screen.getByLabelText('제목'), '심야 합주');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(m.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ draft: { title: '심야 합주', note: null, tag: 'jam', participantIds: [], slotIds: ['2030-01-01_23-30'] } }),
    ));
  });

  it('합주는 종료가 1시간까지만 나오고, 강습·기타는 24:00까지 고를 수 있다', async () => {
    const user = userEvent.setup();
    renderSheet();
    const end = () => screen.getByLabelText('종료 시각') as HTMLSelectElement;
    expect([...end().options].map((option) => option.textContent)).toEqual(['18:30 (30분)', '19:00 (1시간)']);

    await user.click(screen.getByRole('button', { name: '강습' }));
    expect(screen.getByText(/09:00–24:00 안에서 원하는 만큼/)).toBeTruthy();
    expect(end().options).toHaveLength(12);
    expect(end().options[end().options.length - 1].textContent).toBe('24:00 (6시간)');
    await user.selectOptions(end(), '22:00');

    // 4시간 강습에서 합주로 바꾸면 1시간 안으로 줄어든다.
    await user.click(screen.getByRole('button', { name: '합주' }));
    expect(end().value).toBe('19:00');

    await user.click(screen.getByRole('button', { name: '기타' }));
    await user.selectOptions(end(), '00:00');
    await user.type(screen.getByLabelText('제목'), '공연 리허설');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(m.createReservation).toHaveBeenCalled());
    const call = m.createReservation.mock.calls[0][0] as { draft: { tag: string; slotIds: string[] } };
    expect(call.draft.tag).toBe('etc');
    expect(call.draft.slotIds).toHaveLength(12);
  });

  it('다른 장소에서도 태그를 고를 수 있고 일정에 담긴다', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: '다른 장소' }));
    await user.click(screen.getByRole('button', { name: '강습' }));
    await user.type(screen.getByLabelText('제목'), '보컬 강습');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(m.createEvent).toHaveBeenCalledWith(expect.objectContaining({ tag: 'lesson' }), 'u1'));
  });

  it('다른 장소에서 분 단위로 입력한 시간은 동아리방으로 바꾸면 30분 선택지로 맞춰진다', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: '다른 장소' }));
    const start = screen.getByLabelText('시작 시각') as HTMLInputElement;
    expect(start.type).toBe('time');
    fireEvent.change(start, { target: { value: '18:10' } });
    fireEvent.change(screen.getByLabelText('종료 날짜'), { target: { value: '2030-01-02' } });
    await user.click(screen.getByRole('button', { name: '동아리방' }));
    expect((screen.getByLabelText('시작 시각') as HTMLSelectElement).value).toBe('18:00');
    // 기존 종료 19:00은 합주 1시간 안이므로 유지하고, 다음 날로 적었던 종료 날짜는 같은 날로 묶는다.
    expect((screen.getByLabelText('종료 시각') as HTMLSelectElement).value).toBe('19:00');
    await user.type(screen.getByLabelText('제목'), '합주');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(m.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ draft: expect.objectContaining({ slotIds: ['2030-01-01_18-00', '2030-01-01_18-30'] }) }),
    ));
  });

  it('다른 장소에서는 시작 날짜를 바꾸면 종료 날짜도 따라간다', async () => {
    renderSheet();
    await userEvent.setup().click(screen.getByRole('button', { name: '다른 장소' }));
    fireEvent.change(screen.getByLabelText('시작 날짜'), { target: { value: '2030-01-05' } });
    expect((screen.getByLabelText('종료 날짜') as HTMLInputElement).value).toBe('2030-01-05');
  });

  it('입력 검증 오류는 저장 전에 사용자 문구로 알린다', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect((await screen.findByRole('status')).textContent).toBe('제목을 1~40자로 입력해주세요.');
    expect(m.createReservation).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('설명 (선택)'), '메모');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('슬롯 충돌이면 시트를 유지하고 목록 새로고침을 요청한다', async () => {
    m.createReservation.mockRejectedValue(new SlotConflictError());
    const user = userEvent.setup();
    renderSheet();
    await user.type(screen.getByLabelText('제목'), '합주');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect((await screen.findByRole('status')).textContent).toBe('방금 다른 회원이 이 시간을 예약했어요.');
    expect(onStale).toHaveBeenCalledOnce();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('저장 계층 오류를 종류별로 안내한다', async () => {
    m.createReservation
      .mockRejectedValueOnce(new ReservationValidationError('past'))
      .mockRejectedValueOnce({ code: 'permission-denied' })
      .mockRejectedValueOnce(new Error('unavailable'));
    m.createEvent.mockRejectedValueOnce(new EventValidationError('title'));
    const user = userEvent.setup();
    renderSheet();
    await user.type(screen.getByLabelText('제목'), '합주');
    const save = () => user.click(screen.getByRole('button', { name: '저장' }));
    await save();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('이미 지난 시간은 예약할 수 없어요.'));
    await save();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('이 일정을 바꿀 권한이 없어요.'));
    await save();
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('연결 상태를 확인'));
    await user.click(screen.getByRole('button', { name: '다른 장소' }));
    await save();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('제목을 1~60자로 입력해주세요.'));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('오프라인이면 저장을 막고, 닫기·배경·Escape로 닫는다', async () => {
    m.online.current = false;
    const { container } = renderSheet();
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(container.querySelector('.modal-overlay') as Element);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('EntrySheet 합주 초대', () => {
  it('합주일 때만 나를 뺀 회원 목록이 나오고, 고른 회원을 참여자로 저장한다', async () => {
    const user = userEvent.setup();
    renderSheet();
    expect(screen.getByRole('group', { name: '함께할 회원 (선택)' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: '김희나' })).toBeNull(); // 나 자신은 제외
    await user.click(screen.getByRole('checkbox', { name: '이나리' }));
    await user.click(screen.getByRole('checkbox', { name: '박드럼' }));
    await user.click(screen.getByRole('checkbox', { name: '박드럼' }));
    expect(screen.getByText('1명 선택됨')).toBeTruthy();
    await user.type(screen.getByLabelText('제목'), '합주');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(m.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ draft: expect.objectContaining({ participantIds: ['u2'] }) }),
    ));
  });

  it('강습·기타로 바꾸면 초대 목록을 숨기고 참여자를 저장하지 않는다', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('checkbox', { name: '이나리' }));
    await user.click(screen.getByRole('button', { name: '강습' }));
    expect(screen.queryByRole('group', { name: '함께할 회원 (선택)' })).toBeNull();
    await user.type(screen.getByLabelText('제목'), '보컬 강습');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(m.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ draft: expect.objectContaining({ tag: 'lesson', participantIds: [] }) }),
    ));
  });

  it('명부를 불러오는 중·실패·비어 있음을 안내한다', () => {
    m.members = { status: 'loading', members: [] };
    const { rerender } = renderSheet();
    expect(screen.getByText('회원 목록을 불러오고 있어요…')).toBeTruthy();
    m.members = { status: 'error', members: [] };
    rerender(<EntrySheet mode={{ kind: 'create', dayKey: '2030-01-01' }} viewer={viewer} onClose={onClose} onSaved={onSaved} onStale={onStale} />);
    expect(screen.getByText(/회원 목록을 불러오지 못했어요/)).toBeTruthy();
    m.members = { status: 'ready', members: [{ uid: 'u1', name: '김희나' }] };
    rerender(<EntrySheet mode={{ kind: 'create', dayKey: '2030-01-01' }} viewer={viewer} onClose={onClose} onSaved={onSaved} onStale={onStale} />);
    expect(screen.getByText(/초대할 수 있는 회원이 없어요/)).toBeTruthy();
  });

  it('20명을 고르면 나머지 회원은 고를 수 없다', async () => {
    m.members = { status: 'ready', members: Array.from({ length: 22 }, (_, i) => ({ uid: `m${i}`, name: `회원${String(i).padStart(2, '0')}` })) };
    const user = userEvent.setup();
    renderSheet();
    for (let i = 0; i < 20; i += 1) await user.click(screen.getByRole('checkbox', { name: `회원${String(i).padStart(2, '0')}` }));
    expect((screen.getByRole('checkbox', { name: '회원20' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox', { name: '회원00' }) as HTMLInputElement).disabled).toBe(false);
  });

  it('수정할 때는 기존 참여자가 선택돼 있다', () => {
    renderSheet({ kind: 'edit-reservation', reservation: { ...myReservation, tag: 'jam', participantIds: ['u3'], endAt: kstInstant('2030-01-01', '19:00') } });
    expect((screen.getByRole('checkbox', { name: '박드럼' }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('EntrySheet 수정·삭제', () => {
  it('내 예약을 같은 모달로 열어 시간까지 바꿔 저장한다', async () => {
    const user = userEvent.setup();
    renderSheet({ kind: 'edit-reservation', reservation: myReservation });
    expect(screen.getByRole('dialog', { name: '일정 수정' })).toBeTruthy();
    expect((screen.getByLabelText('설명 (선택)') as HTMLTextAreaElement).value).toBe('마이크');
    fireEvent.change(screen.getByLabelText('종료 시각'), { target: { value: '20:00' } });
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('일정을 수정했어요.'));
    expect(m.rescheduleReservation).toHaveBeenCalledWith({
      reservationId: 'r1',
      viewerId: 'u1',
      draft: { title: '보컬 연습', note: '마이크', tag: 'lesson', participantIds: [], slotIds: ['2030-01-01_18-00', '2030-01-01_18-30', '2030-01-01_19-00', '2030-01-01_19-30'] },
    });
  });

  it('예약을 일반 일정으로(또는 반대로) 바꾸려 하면 막는다', async () => {
    const user = userEvent.setup();
    renderSheet({ kind: 'edit-reservation', reservation: myReservation });
    await user.click(screen.getByRole('button', { name: '다른 장소' }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect((await screen.findByRole('status')).textContent).toBe('동아리방 시간 예약 여부는 바꿀 수 없어요. 삭제 후 다시 추가해주세요.');
    expect(m.rescheduleReservation).not.toHaveBeenCalled();
    expect(m.updateEvent).not.toHaveBeenCalled();
  });

  it('지난 예약 변경 거부 메시지를 보여준다', async () => {
    m.rescheduleReservation.mockRejectedValue(new PastReservationError());
    const user = userEvent.setup();
    renderSheet({ kind: 'edit-reservation', reservation: myReservation });
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect((await screen.findByRole('status')).textContent).toBe('이미 시작한 예약은 변경할 수 없어요.');
  });

  it('내 일정을 수정 저장한다', async () => {
    const user = userEvent.setup();
    renderSheet({ kind: 'edit-event', event: myEvent });
    expect(screen.getByRole('button', { name: '다른 장소' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('장소 이름 (선택)') as HTMLInputElement).value).toBe('대강당');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(m.updateEvent).toHaveBeenCalledWith('e1', expect.objectContaining({ title: '가을 공연', location: '대강당' }), 'u1'));
  });

  it('삭제는 확인 단계를 거쳐 예약이면 슬롯까지, 일정이면 문서를 지운다', async () => {
    const user = userEvent.setup();
    const { unmount } = renderSheet({ kind: 'edit-reservation', reservation: myReservation });
    await user.click(screen.getByRole('button', { name: /삭제/ }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('button', { name: '삭제 확정' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /삭제/ }));
    await user.click(screen.getByRole('button', { name: '삭제 확정' }));
    await waitFor(() => expect(m.cancelReservation).toHaveBeenCalledWith({ reservationId: 'r1', viewerId: 'u1' }));
    unmount();
    renderSheet({ kind: 'edit-event', event: myEvent });
    await user.click(screen.getByRole('button', { name: /삭제/ }));
    await user.click(screen.getByRole('button', { name: '삭제 확정' }));
    await waitFor(() => expect(m.deleteEvent).toHaveBeenCalledWith('e1'));
    expect(onSaved).toHaveBeenCalledWith('일정을 삭제했어요.');
  });

  it('삭제 실패 시 확인 단계를 닫고 오류를 보인다', async () => {
    m.deleteEvent.mockRejectedValue(new Error('x'));
    const user = userEvent.setup();
    renderSheet({ kind: 'edit-event', event: myEvent });
    await user.click(screen.getByRole('button', { name: /삭제/ }));
    await user.click(screen.getByRole('button', { name: '삭제 확정' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '삭제 확정' })).toBeNull();
  });
});
