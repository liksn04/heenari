import { getFirebaseDb } from '../lib/firebase';
import { memberName } from '../members/memberRepository';
import { normalizeNotice, type NoticeError, type NoticeInput, type NoticeView } from './notice';

export class NoticeValidationError extends Error {
  readonly reason: NoticeError;
  constructor(reason: NoticeError) {
    super(reason);
    this.name = 'NoticeValidationError';
    this.reason = reason;
  }
}

interface TimestampLike {
  toDate(): Date;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as TimestampLike).toDate === 'function') return (value as TimestampLike).toDate();
  // 방금 쓴 문서의 serverTimestamp는 아직 값이 없을 수 있다.
  return new Date();
}

export interface ReadSnapshot {
  id: string;
  data(): Record<string, unknown> | undefined;
}

export function mapNoticeSnapshot(snapshot: ReadSnapshot): NoticeView {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    title: data.title as string,
    body: data.body as string,
    authorId: data.authorId as string,
    authorName: data.authorName as string,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function parse(input: NoticeInput): NoticeInput {
  const notice = normalizeNotice(input);
  if (typeof notice === 'string') throw new NoticeValidationError(notice);
  return notice;
}

// ---- Firestore 배선 (Firestore SDK는 인증 이후에만 동적 로드) ----------------

const NOTICES = 'notices';

async function loadFirestore() {
  const [fs, db] = await Promise.all([import('firebase/firestore'), getFirebaseDb()]);
  return { fs, db };
}

// 최신 공지부터.
export async function fetchNotices(max: number): Promise<NoticeView[]> {
  const { fs, db } = await loadFirestore();
  const snapshot = await fs.getDocs(fs.query(fs.collection(db, NOTICES), fs.orderBy('createdAt', 'desc'), fs.limit(max)));
  return snapshot.docs.map((docSnapshot) => mapNoticeSnapshot(docSnapshot));
}

// Rules상 운영진(admins)만 성공한다.
export async function createNotice(input: NoticeInput, author: { uid: string; name: string }): Promise<string> {
  const notice = parse(input);
  const { fs, db } = await loadFirestore();
  const ref = fs.doc(fs.collection(db, NOTICES));
  await fs.setDoc(ref, {
    ...notice,
    authorId: author.uid,
    authorName: memberName(author.name),
    createdAt: fs.serverTimestamp(),
    updatedAt: fs.serverTimestamp(),
  });
  return ref.id;
}

// 작성자 정보와 작성 시각은 그대로 두고 제목·내용만 고친다.
export async function updateNotice(noticeId: string, input: NoticeInput): Promise<void> {
  const notice = parse(input);
  const { fs, db } = await loadFirestore();
  await fs.updateDoc(fs.doc(db, NOTICES, noticeId), { ...notice, updatedAt: fs.serverTimestamp() });
}

export async function deleteNotice(noticeId: string): Promise<void> {
  const { fs, db } = await loadFirestore();
  await fs.deleteDoc(fs.doc(db, NOTICES, noticeId));
}
