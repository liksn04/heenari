import { describe, expect, it } from 'vitest';
import { buildInviteJob, MAX_PARTICIPANTS, newInvitees, normalizeParticipants, readParticipantIds } from './invites';

describe('newInvitees', () => {
  it('이전에 없던 회원만 돌려준다', () => {
    expect(newInvitees([], ['a', 'b'])).toEqual(['a', 'b']);
    expect(newInvitees(['a'], ['a', 'b'])).toEqual(['b']);
    expect(newInvitees(['a', 'b'], ['b'])).toEqual([]);
  });
});

describe('normalizeParticipants', () => {
  it('작성자·빈 값·중복을 빼고 순서를 지킨다', () => {
    expect(normalizeParticipants(['b', 'me', 'a', 'b', ''], 'me')).toEqual(['b', 'a']);
  });

  it('최대 인원까지만 남긴다', () => {
    const many = Array.from({ length: MAX_PARTICIPANTS + 5 }, (_, i) => `m${i}`);
    expect(normalizeParticipants(many, 'me')).toHaveLength(MAX_PARTICIPANTS);
  });
});

describe('buildInviteJob', () => {
  it('Rules가 요구하는 필드만 담는다', () => {
    expect(buildInviteJob('reservations', 'r1', ['a'], 'me', '__server')).toEqual({
      kind: 'invite', collection: 'reservations', docId: 'r1', targetIds: ['a'], createdBy: 'me', createdAt: '__server',
    });
  });
});

describe('readParticipantIds', () => {
  it('문자열 배열만 읽고 없으면 빈 배열', () => {
    expect(readParticipantIds(['a', 1, 'b'])).toEqual(['a', 'b']);
    expect(readParticipantIds(undefined)).toEqual([]);
  });
});
