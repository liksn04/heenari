import { getFirebaseDb } from '../lib/firebase';
import { normalizeProfile, type ProfileData, type ProfileInput } from './profile';

// 회원 명부·프로필: 이름과 한줄소개(이메일 저장 안 함).

export interface MemberView {
  uid: string;
  name: string;
}

export class ProfileValidationError extends Error {
  readonly reason: 'name' | 'bio';
  constructor(reason: 'name' | 'bio') {
    super(reason);
    this.name = 'ProfileValidationError';
    this.reason = reason;
  }
}

const MEMBERS = 'members';
const NAME_MAX = 60;

async function loadFirestore() {
  const [fs, db] = await Promise.all([import('firebase/firestore'), getFirebaseDb()]);
  return { fs, db };
}

export function memberName(name: string): string {
  const trimmed = name.trim();
  return (trimmed.length === 0 ? '회원' : trimmed).slice(0, NAME_MAX);
}

function toProfile(data: Record<string, unknown> | undefined, fallbackName: string): ProfileData {
  return {
    name: typeof data?.name === 'string' && data.name.trim() ? data.name : fallbackName,
    bio: typeof data?.bio === 'string' && data.bio.trim() ? data.bio : null,
  };
}

// 로그인할 때: 명부 문서가 없으면 Google 이름으로 만든다. 이미 있으면(직접 고친 이름 포함) 그대로 둔다.
export async function ensureMemberProfile(uid: string, googleName: string): Promise<ProfileData> {
  const { fs, db } = await loadFirestore();
  const ref = fs.doc(db, MEMBERS, uid);
  const snapshot = await fs.getDoc(ref);
  if (snapshot.exists()) return toProfile(snapshot.data(), memberName(googleName));
  const created: ProfileData = { name: memberName(googleName), bio: null };
  await fs.setDoc(ref, { ...created, updatedAt: fs.serverTimestamp() });
  return created;
}

export async function fetchMemberProfile(uid: string): Promise<ProfileData | null> {
  const { fs, db } = await loadFirestore();
  const snapshot = await fs.getDoc(fs.doc(db, MEMBERS, uid));
  return snapshot.exists() ? toProfile(snapshot.data(), '회원') : null;
}

export async function updateMemberProfile(uid: string, input: ProfileInput): Promise<ProfileData> {
  const profile = normalizeProfile(input);
  if (typeof profile === 'string') throw new ProfileValidationError(profile);
  const { fs, db } = await loadFirestore();
  await fs.setDoc(fs.doc(db, MEMBERS, uid), { ...profile, updatedAt: fs.serverTimestamp() });
  return profile;
}

export async function fetchMembers(): Promise<MemberView[]> {
  const { fs, db } = await loadFirestore();
  const snapshot = await fs.getDocs(fs.collection(db, MEMBERS));
  return snapshot.docs
    .map((docSnapshot) => ({ uid: docSnapshot.id, name: String(docSnapshot.data().name ?? '회원') }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}
