// 회원 프로필: 이름(실명 권장)과 한줄소개. Firebase에 의존하지 않는다.

export const PROFILE_LIMITS = { nameMax: 20, bioMax: 60 } as const;

export interface ProfileInput {
  name: string;
  bio: string;
}

export interface ProfileData {
  name: string;
  bio: string | null;
}

export type ProfileError = 'name' | 'bio';

export function normalizeProfile(input: ProfileInput): ProfileData | ProfileError {
  const name = input.name.trim();
  if (name.length < 1 || name.length > PROFILE_LIMITS.nameMax) return 'name';
  const bio = input.bio.trim();
  if (bio.length > PROFILE_LIMITS.bioMax) return 'bio';
  return { name, bio: bio === '' ? null : bio };
}

// 나를 뺀 회원 중 같은 이름(공백·대소문자 무시)이 있는가. 동명이인이면 확인을 받는다.
export function hasSameName(name: string, others: { uid: string; name: string }[], selfUid: string): boolean {
  const key = name.trim().toLowerCase();
  if (!key) return false;
  return others.some((member) => member.uid !== selfUid && member.name.trim().toLowerCase() === key);
}
