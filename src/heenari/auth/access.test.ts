import { describe, expect, it } from 'vitest';
import { resolveGoogleMember } from './access';

describe('resolveGoogleMember', () => {
  it('인증 사용자가 없으면 로그아웃 상태를 반환한다', () => {
    expect(resolveGoogleMember(null)).toEqual({ status: 'signed-out' });
  });

  it('Google 제공자가 아니면 접근을 거부한다', () => {
    expect(resolveGoogleMember({
      email: 'member@example.com',
      emailVerified: true,
      displayName: '희나리 회원',
      providerIds: ['password'],
    })).toEqual({ status: 'untrusted-provider' });
  });

  it('검증되지 않은 이메일은 접근을 거부한다', () => {
    expect(resolveGoogleMember({
      email: 'member@example.com',
      emailVerified: false,
      displayName: '희나리 회원',
      providerIds: ['google.com'],
    })).toEqual({ status: 'unverified-email' });
  });

  it('검증된 Google 사용자를 회원으로 변환한다', () => {
    expect(resolveGoogleMember({
      email: 'member@example.com',
      emailVerified: true,
      displayName: '희나리 회원',
      providerIds: ['google.com'],
    })).toEqual({
      status: 'allowed',
      member: {
        name: '희나리 회원',
        email: 'member@example.com',
        role: 'member',
        active: true,
      },
    });
  });

  it('표시 이름이 없으면 이메일 앞부분을 사용한다', () => {
    expect(resolveGoogleMember({
      email: 'heenari.member@example.com',
      emailVerified: true,
      displayName: null,
      providerIds: ['google.com'],
    })).toMatchObject({
      status: 'allowed',
      member: { name: 'heenari.member' },
    });
  });
});
