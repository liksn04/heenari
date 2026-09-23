import { getFirebaseDb } from '../lib/firebase';
import { isTag } from '../reservations/policy';
import { MAX_EVENT_DURATION_MS, eventOverlaps, parseEventDraft } from './eventPolicy';
import type { ClubEventView, EventDraft, EventInput } from './types';

// ---- 스냅샷 → 뷰 ------------------------------------------------------------

interface TimestampLike {
  toDate(): Date;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as TimestampLike).toDate === 'function') return (value as TimestampLike).toDate();
  return new Date(value as string);
}

export interface ReadSnapshot {
  id: string;
  data(): Record<string, unknown> | undefined;
}

export function mapEventSnapshot(snapshot: ReadSnapshot): ClubEventView {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    title: data.title as string,
    description: (data.description as string | null) ?? null,
    location: (data.location as string | null) ?? null,
    startAt: toDate(data.startAt),
    endAt: data.endAt ? toDate(data.endAt) : null,
    allDay: data.allDay === true,
    tag: isTag(data.tag) ? data.tag : null,
    createdBy: data.createdBy as string,
  };
}

// ---- Firestore 배선 (Firestore SDK는 인증 이후에만 동적 로드) ----------------

const EVENTS = 'events';
const UPCOMING_LIMIT = 20;

type FirestoreModule = typeof import('firebase/firestore');

async function loadFirestore(): Promise<{ fs: FirestoreModule; db: Awaited<ReturnType<typeof getFirebaseDb>> }> {
  const [fs, db] = await Promise.all([import('firebase/firestore'), getFirebaseDb()]);
  return { fs, db };
}

function eventFields(fs: FirestoreModule, input: EventInput): Record<string, unknown> {
  return {
    title: input.title,
    description: input.description,
    location: input.location,
    startAt: fs.Timestamp.fromDate(input.startAt),
    endAt: input.endAt ? fs.Timestamp.fromDate(input.endAt) : null,
    allDay: input.allDay,
    tag: input.tag,
  };
}

// [from, to)에 걸친 일정. 여러 날 일정을 놓치지 않도록 최대 길이만큼 앞당겨 조회한다.
export async function fetchEventsBetween(from: Date, to: Date): Promise<ClubEventView[]> {
  const { fs, db } = await loadFirestore();
  const snapshot = await fs.getDocs(
    fs.query(
      fs.collection(db, EVENTS),
      fs.where('startAt', '>=', fs.Timestamp.fromDate(new Date(from.getTime() - MAX_EVENT_DURATION_MS))),
      fs.where('startAt', '<', fs.Timestamp.fromDate(to)),
      fs.orderBy('startAt', 'asc'),
    ),
  );
  return snapshot.docs.map((docSnapshot) => mapEventSnapshot(docSnapshot)).filter((event) => eventOverlaps(event, from, to));
}

// 홈의 다음 일정 후보. 진행 중인 여러 날 일정까지 포함하도록 최대 길이만큼 앞당긴다.
export async function fetchUpcomingEventCandidates(now: Date = new Date()): Promise<ClubEventView[]> {
  const { fs, db } = await loadFirestore();
  const snapshot = await fs.getDocs(
    fs.query(
      fs.collection(db, EVENTS),
      fs.where('startAt', '>=', fs.Timestamp.fromDate(new Date(now.getTime() - MAX_EVENT_DURATION_MS))),
      fs.orderBy('startAt', 'asc'),
      fs.limit(UPCOMING_LIMIT),
    ),
  );
  return snapshot.docs.map((docSnapshot) => mapEventSnapshot(docSnapshot));
}

export async function createEvent(draft: EventDraft, adminId: string): Promise<string> {
  const input = parseEventDraft(draft);
  const { fs, db } = await loadFirestore();
  const ref = await fs.addDoc(fs.collection(db, EVENTS), {
    ...eventFields(fs, input),
    createdBy: adminId,
    createdAt: fs.serverTimestamp(),
    updatedAt: fs.serverTimestamp(),
  });
  return ref.id;
}

export async function updateEvent(eventId: string, draft: EventDraft): Promise<void> {
  const input = parseEventDraft(draft);
  const { fs, db } = await loadFirestore();
  await fs.updateDoc(fs.doc(db, EVENTS, eventId), { ...eventFields(fs, input), updatedAt: fs.serverTimestamp() });
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { fs, db } = await loadFirestore();
  await fs.deleteDoc(fs.doc(db, EVENTS, eventId));
}
