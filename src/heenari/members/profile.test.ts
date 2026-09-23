import { describe, expect, it } from 'vitest';
import { hasSameName, normalizeProfile } from './profile';

describe('normalizeProfile', () => {
  it('이름·소개를 다듬고 빈 소개는 null', () => {
    expect(normalizeProfile({ name: ' 김희나 ', bio: '  ' })).toEqual({ name: '김희나', bio: null });
    expect(normalizeProfile({ name: '김희나', bio: ' 주말 합주 환영 ' })).toEqual({ name: '김희나', bio: '주말 합주 환영' });
  });

  it('이름 1–20자, 소개 60자 제한', () => {
    expect(normalizeProfile({ name: ' ', bio: '' })).toBe('name');
    expect(normalizeProfile({ name: '가'.repeat(21), bio: '' })).toBe('name');
    expect(normalizeProfile({ name: '가'.repeat(20), bio: '가'.repeat(60) })).toEqual({ name: '가'.repeat(20), bio: '가'.repeat(60) });
    expect(normalizeProfile({ name: '김희나', bio: '가'.repeat(61) })).toBe('bio');
  });
});

describe('hasSameName', () => {
  const members = [{ uid: 'me', name: '김희나' }, { uid: 'u2', name: 'Nari Lee' }];
  it('나를 뺀 회원 중 같은 이름을 찾는다(공백·대소문자 무시)', () => {
    expect(hasSameName('김희나', members, 'me')).toBe(false);
    expect(hasSameName(' nari lee ', members, 'me')).toBe(true);
    expect(hasSameName('', members, 'me')).toBe(false);
  });
});
