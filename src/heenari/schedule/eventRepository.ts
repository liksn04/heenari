import { getFirebaseDb } from '../lib/firebase';
import { isTag } from '../reservations/policy';
import { buildInviteJob, newInvitees, normalizeParticipants, readParticipantIds } from '../members/invites';
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
    participantIds: readParticipantIds(data.participantIds),
    createdBy: data.createdBy as string,
  };
}

// ---- Firestore 배선 (Firestore SDK는 인증 이후에만 동적 로드) ----------------

const EVENTS = 'events';
const PUSH_JOBS = 'pushJobs';
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

// 일정과 초대 알림 작업을 한 배치로 쓴다. 작업은 새 참여자가 있을 때만.
export async function createEvent(draft: EventDraft, authorId: string): Promise<string> {
  const input = parseEventDraft(draft);
  const { fs, db } = await loadFirestore();
  const participants = normalizeParticipants(input.participantIds, authorId);
  const ref = fs.doc(fs.collection(db, EVENTS));
  const batch = fs.writeBatch(db);
  batch.set(ref, {
    ...eventFields(fs, input),
    participantIds: participants,
    createdBy: authorId,
    createdAt: fs.serverTimestamp(),
    updatedAt: fs.serverTimestamp(),
  });
  if (participants.length > 0) {
    batch.set(fs.doc(fs.collection(db, PUSH_JOBS)), buildInviteJob('events', ref.id, participants, authorId, fs.serverTimestamp()));
  }
  await batch.commit();
  return ref.id;
}

export class EventNotFoundError extends Error {
  constructor() {
    super('일정을 찾을 수 없어요.');
    this.name = 'EventNotFoundError';
  }
}

// 기존 참여자를 읽어 새로 초대된 회원에게만 알림 작업을 쓴다.
// Rules상 알림 작업은 작성자만 만들 수 있어, 관리자가 남의 일정을 고칠 때는 작업을 쓰지 않는다.
export async function updateEvent(eventId: string, draft: EventDraft, viewerId: string): Promise<void> {
  const input = parseEventDraft(draft);
  const { fs, db } = await loadFirestore();
  const ref = fs.doc(db, EVENTS, eventId);
  await fs.runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) throw new EventNotFoundError();
    const current = snapshot.data() as { createdBy?: string; participantIds?: unknown };
    const authorId = current.createdBy ?? viewerId;
    const participants = normalizeParticipants(input.participantIds, authorId);
    tx.update(ref, { ...eventFields(fs, input), participantIds: participants, updatedAt: fs.serverTimestamp() });
    const invited = newInvitees(readParticipantIds(current.participantIds), participants);
    if (invited.length > 0 && authorId === viewerId) {
      tx.set(fs.doc(fs.collection(db, PUSH_JOBS)), buildInviteJob('events', eventId, invited, viewerId, fs.serverTimestamp()));
    }
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { fs, db } = await loadFirestore();
  await fs.deleteDoc(fs.doc(db, EVENTS, eventId));
}
