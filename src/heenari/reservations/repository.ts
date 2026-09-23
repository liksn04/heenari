import { getFirebaseDb } from '../lib/firebase';
import {
  isBookableDay,
  isTag,
  JAM_MAX_SLOTS,
  maxSlotsFor,
  reservationWindow,
  validateNote,
  validateSlotSelection,
  validateTitle,
  type ReservationWindow,
  type SlotSelectionError,
} from './policy';
import { SLOT_MINUTES, slotIdToStartAt } from './slots';
import type { ReservationDraft, ReservationView } from './types';
import { buildInviteJob, newInvitees, normalizeParticipants, readParticipantIds } from '../members/invites';

// ---- 오류 ------------------------------------------------------------------

export type DraftInvalidReason = SlotSelectionError | 'jam-too-long' | 'title' | 'note' | 'out-of-window' | 'past';

export class ReservationValidationError extends Error {
  readonly reason: DraftInvalidReason;
  constructor(reason: DraftInvalidReason) {
    super(reason);
    this.name = 'ReservationValidationError';
    this.reason = reason;
  }
}

export class SlotConflictError extends Error {
  constructor() {
    super('방금 다른 회원이 이 시간을 예약했어요.');
    this.name = 'SlotConflictError';
  }
}

export class ReservationNotFoundError extends Error {
  constructor() {
    super('예약을 찾을 수 없어요.');
    this.name = 'ReservationNotFoundError';
  }
}

export class ReservationOwnershipError extends Error {
  constructor() {
    super('본인 예약만 변경할 수 있어요.');
    this.name = 'ReservationOwnershipError';
  }
}

export class PastReservationError extends Error {
  constructor() {
    super('이미 시작한 예약은 변경할 수 없어요.');
    this.name = 'PastReservationError';
  }
}

// ---- 트랜잭션 추상화 (에뮬레이터 없이 단위 테스트 가능) --------------------

export interface DocRefLike {
  id: string;
}

export interface DocSnapshotLike {
  id: string;
  exists(): boolean;
  data(): Record<string, unknown> | undefined;
}

export interface WriteTransaction {
  get(ref: DocRefLike): Promise<DocSnapshotLike>;
  set(ref: DocRefLike, data: Record<string, unknown>): void;
  update(ref: DocRefLike, data: Record<string, unknown>): void;
  delete(ref: DocRefLike): void;
}

export interface TimeAdapter {
  fromDate(date: Date): unknown;
  serverTimestamp(): unknown;
}

interface TimestampLike {
  toDate(): Date;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as TimestampLike).toDate === 'function') {
    return (value as TimestampLike).toDate();
  }
  return new Date(value as string);
}

function normalizeNote(note: string | null): string | null {
  if (note === null) return null;
  const trimmed = note.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// ---- 순수 검증 & 빌더 -------------------------------------------------------

export function assertValidDraft(draft: ReservationDraft, now: Date = new Date()): ReservationWindow {
  const selectionError = validateSlotSelection(draft.slotIds);
  if (selectionError) throw new ReservationValidationError(selectionError);
  if (draft.slotIds.length > maxSlotsFor(draft.tag ?? 'etc')) throw new ReservationValidationError('jam-too-long');
  if (!validateTitle(draft.title)) throw new ReservationValidationError('title');
  if (!validateNote(draft.note)) throw new ReservationValidationError('note');

  const window = reservationWindow(draft.slotIds);
  if (!isBookableDay(window.dayKey, now)) throw new ReservationValidationError('out-of-window');
  if (window.startAt.getTime() <= now.getTime()) throw new ReservationValidationError('past');
  return window;
}

function sortedSlotIds(slotIds: string[]): string[] {
  return [...slotIds].sort();
}

export interface ReservationDataInput {
  draft: ReservationDraft;
  ownerId: string;
  ownerName: string;
  window: ReservationWindow;
}

export function buildReservationData(input: ReservationDataInput, time: TimeAdapter): Record<string, unknown> {
  return {
    title: input.draft.title.trim(),
    note: normalizeNote(input.draft.note),
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    startAt: time.fromDate(input.window.startAt),
    endAt: time.fromDate(input.window.endAt),
    dayKey: input.window.dayKey,
    slotIds: sortedSlotIds(input.draft.slotIds),
    tag: input.draft.tag ?? 'etc',
    participantIds: normalizeParticipants(input.draft.participantIds ?? [], input.ownerId),
    createdAt: time.serverTimestamp(),
    updatedAt: time.serverTimestamp(),
  };
}

export function buildSlotData(
  slotId: string,
  ownerId: string,
  reservationId: string,
  dayKey: string,
  time: TimeAdapter,
): Record<string, unknown> {
  return {
    reservationId,
    ownerId,
    dayKey,
    startsAt: time.fromDate(slotIdToStartAt(slotId)),
    createdAt: time.serverTimestamp(),
  };
}

// ---- 트랜잭션 본문 (계약: 모든 read 이후에만 write) ------------------------

export interface WritePlan {
  ref: DocRefLike;
  data: Record<string, unknown>;
}

export interface CreatePlan {
  reservationRef: DocRefLike;
  reservationData: Record<string, unknown>;
  slots: WritePlan[];
  inviteJob?: WritePlan; // 참여자가 있으면 같은 트랜잭션에 초대 알림 작업을 쓴다
}

export async function applyCreate(tx: WriteTransaction, plan: CreatePlan): Promise<void> {
  const snapshots = await Promise.all(plan.slots.map((slot) => tx.get(slot.ref)));
  if (snapshots.some((snap) => snap.exists())) throw new SlotConflictError();

  tx.set(plan.reservationRef, plan.reservationData);
  for (const slot of plan.slots) tx.set(slot.ref, slot.data);
  if (plan.inviteJob) tx.set(plan.inviteJob.ref, plan.inviteJob.data);
}

interface OwnedReservation {
  ownerId: string;
  slotIds: string[];
  startAt: unknown;
  participantIds?: unknown;
}

async function readOwnedFutureReservation(
  tx: WriteTransaction,
  reservationRef: DocRefLike,
  viewerId: string,
  now: Date,
): Promise<OwnedReservation> {
  const snapshot = await tx.get(reservationRef);
  if (!snapshot.exists()) throw new ReservationNotFoundError();
  const data = snapshot.data() as unknown as OwnedReservation;
  if (data.ownerId !== viewerId) throw new ReservationOwnershipError();
  if (toDate(data.startAt).getTime() <= now.getTime()) throw new PastReservationError();
  return data;
}

export interface CancelPlan {
  reservationRef: DocRefLike;
  slotRef: (slotId: string) => DocRefLike;
  viewerId: string;
  now: Date;
}

export async function applyCancel(tx: WriteTransaction, plan: CancelPlan): Promise<void> {
  const data = await readOwnedFutureReservation(tx, plan.reservationRef, plan.viewerId, plan.now);
  const slotRefs = data.slotIds.map(plan.slotRef);
  // 계약: 삭제 전 슬롯 문서를 모두 읽는다.
  await Promise.all(slotRefs.map((ref) => tx.get(ref)));

  tx.delete(plan.reservationRef);
  for (const ref of slotRefs) tx.delete(ref);
}

export interface ReschedulePlan {
  reservationRef: DocRefLike;
  slotRef: (slotId: string) => DocRefLike;
  viewerId: string;
  now: Date;
  newSlotIds: string[];
  newParticipantIds?: string[];
  reservationUpdate: Record<string, unknown>;
  slotData: (slotId: string) => Record<string, unknown>;
  inviteJob?: (targetIds: string[]) => WritePlan;
}

export async function applyReschedule(tx: WriteTransaction, plan: ReschedulePlan): Promise<void> {
  const data = await readOwnedFutureReservation(tx, plan.reservationRef, plan.viewerId, plan.now);
  const oldSlotIds = data.slotIds;

  // 계약: 새 슬롯과 제거 대상 슬롯을 모두 먼저 읽는다.
  const newSnapshots = await Promise.all(plan.newSlotIds.map((slotId) => tx.get(plan.slotRef(slotId))));
  newSnapshots.forEach((snapshot) => {
    if (snapshot.exists() && (snapshot.data() as { reservationId?: string }).reservationId !== plan.reservationRef.id) {
      throw new SlotConflictError();
    }
  });

  const removed = oldSlotIds.filter((slotId) => !plan.newSlotIds.includes(slotId));
  const added = plan.newSlotIds.filter((slotId) => !oldSlotIds.includes(slotId));
  await Promise.all(removed.map((slotId) => tx.get(plan.slotRef(slotId))));

  for (const slotId of removed) tx.delete(plan.slotRef(slotId));
  tx.update(plan.reservationRef, plan.reservationUpdate);
  for (const slotId of added) tx.set(plan.slotRef(slotId), plan.slotData(slotId));

  const invited = newInvitees(readParticipantIds(data.participantIds), plan.newParticipantIds ?? []);
  if (invited.length > 0 && plan.inviteJob) {
    const job = plan.inviteJob(invited);
    tx.set(job.ref, job.data);
  }
}

export interface DetailPlan {
  reservationRef: DocRefLike;
  viewerId: string;
  now: Date;
  update: Record<string, unknown>;
}

export async function applyDetailUpdate(tx: WriteTransaction, plan: DetailPlan): Promise<void> {
  await readOwnedFutureReservation(tx, plan.reservationRef, plan.viewerId, plan.now);
  tx.update(plan.reservationRef, plan.update);
}

// ---- 스냅샷 → 뷰 ------------------------------------------------------------

export interface ReadSnapshot {
  id: string;
  data(): Record<string, unknown> | undefined;
}

export function mapReservationSnapshot(snapshot: ReadSnapshot): ReservationView {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    title: data.title as string,
    note: (data.note as string | null) ?? null,
    ownerId: data.ownerId as string,
    ownerName: data.ownerName as string,
    startAt: toDate(data.startAt),
    endAt: toDate(data.endAt),
    dayKey: data.dayKey as string,
    slotIds: (data.slotIds as string[]) ?? [],
    tag: isTag(data.tag) ? data.tag : null,
    participantIds: readParticipantIds(data.participantIds),
  };
}

// ---- Firestore 배선 (Firestore SDK는 인증 이후에만 동적 로드) ----------------

const RESERVATIONS = 'reservations';
const SLOTS = 'reservationSlots';
const PUSH_JOBS = 'pushJobs';
const UPCOMING_JAM_LIMIT = 5;

type FirestoreModule = typeof import('firebase/firestore');

// 정적 import를 피해 firebase/firestore 청크가 메인 번들에 섞이지 않게 한다.
async function loadFirestore(): Promise<{ fs: FirestoreModule; db: Awaited<ReturnType<typeof getFirebaseDb>> }> {
  const [fs, db] = await Promise.all([import('firebase/firestore'), getFirebaseDb()]);
  return { fs, db };
}

function timeAdapter(fs: FirestoreModule): TimeAdapter {
  return {
    fromDate: (date) => fs.Timestamp.fromDate(date),
    serverTimestamp: () => fs.serverTimestamp(),
  };
}

export interface CreateReservationInput {
  draft: ReservationDraft;
  ownerId: string;
  ownerName: string;
  now?: Date;
}

export async function createReservation(input: CreateReservationInput): Promise<string> {
  const now = input.now ?? new Date();
  const window = assertValidDraft(input.draft, now);
  const { fs, db } = await loadFirestore();
  const time = timeAdapter(fs);
  const slotRef = (slotId: string): DocRefLike => fs.doc(db, SLOTS, slotId);

  const reservationRef: DocRefLike = fs.doc(fs.collection(db, RESERVATIONS));
  const reservationData = buildReservationData(
    { draft: input.draft, ownerId: input.ownerId, ownerName: input.ownerName, window },
    time,
  );
  const slots = sortedSlotIds(input.draft.slotIds).map((slotId) => ({
    ref: slotRef(slotId),
    data: buildSlotData(slotId, input.ownerId, reservationRef.id, window.dayKey, time),
  }));
  const participants = reservationData.participantIds as string[];
  const inviteJob: WritePlan | undefined = participants.length > 0
    ? {
      ref: fs.doc(fs.collection(db, PUSH_JOBS)),
      data: buildInviteJob('reservations', reservationRef.id, participants, input.ownerId, fs.serverTimestamp()),
    }
    : undefined;

  await fs.runTransaction(db, (tx) =>
    applyCreate(tx as unknown as WriteTransaction, { reservationRef, reservationData, slots, inviteJob }),
  );
  return reservationRef.id;
}

export interface CancelReservationInput {
  reservationId: string;
  viewerId: string;
  now?: Date;
}

export async function cancelReservation(input: CancelReservationInput): Promise<void> {
  const { fs, db } = await loadFirestore();
  const reservationRef: DocRefLike = fs.doc(db, RESERVATIONS, input.reservationId);
  await fs.runTransaction(db, (tx) =>
    applyCancel(tx as unknown as WriteTransaction, {
      reservationRef,
      slotRef: (slotId) => fs.doc(db, SLOTS, slotId),
      viewerId: input.viewerId,
      now: input.now ?? new Date(),
    }),
  );
}

export interface UpdateDetailInput {
  reservationId: string;
  viewerId: string;
  title: string;
  note: string | null;
  now?: Date;
}

export async function updateReservationDetails(input: UpdateDetailInput): Promise<void> {
  if (!validateTitle(input.title)) throw new ReservationValidationError('title');
  if (!validateNote(input.note)) throw new ReservationValidationError('note');
  const { fs, db } = await loadFirestore();
  const reservationRef: DocRefLike = fs.doc(db, RESERVATIONS, input.reservationId);
  await fs.runTransaction(db, (tx) =>
    applyDetailUpdate(tx as unknown as WriteTransaction, {
      reservationRef,
      viewerId: input.viewerId,
      now: input.now ?? new Date(),
      update: { title: input.title.trim(), note: normalizeNote(input.note), updatedAt: fs.serverTimestamp() },
    }),
  );
}

export interface RescheduleInput {
  reservationId: string;
  viewerId: string;
  draft: ReservationDraft;
  now?: Date;
}

export async function rescheduleReservation(input: RescheduleInput): Promise<void> {
  const now = input.now ?? new Date();
  const window = assertValidDraft(input.draft, now);
  const { fs, db } = await loadFirestore();
  const time = timeAdapter(fs);
  const slotRef = (slotId: string): DocRefLike => fs.doc(db, SLOTS, slotId);
  const reservationRef: DocRefLike = fs.doc(db, RESERVATIONS, input.reservationId);
  const newSlotIds = sortedSlotIds(input.draft.slotIds);
  const newParticipantIds = normalizeParticipants(input.draft.participantIds ?? [], input.viewerId);

  await fs.runTransaction(db, (tx) =>
    applyReschedule(tx as unknown as WriteTransaction, {
      reservationRef,
      slotRef,
      viewerId: input.viewerId,
      now,
      newSlotIds,
      newParticipantIds,
      inviteJob: (targetIds) => ({
        ref: fs.doc(fs.collection(db, PUSH_JOBS)),
        data: buildInviteJob('reservations', input.reservationId, targetIds, input.viewerId, fs.serverTimestamp()),
      }),
      reservationUpdate: {
        title: input.draft.title.trim(),
        note: normalizeNote(input.draft.note),
        startAt: time.fromDate(window.startAt),
        endAt: time.fromDate(window.endAt),
        dayKey: window.dayKey,
        slotIds: newSlotIds,
        tag: input.draft.tag ?? 'etc',
        participantIds: newParticipantIds,
        updatedAt: fs.serverTimestamp(),
      },
      slotData: (slotId) => buildSlotData(slotId, input.viewerId, input.reservationId, window.dayKey, time),
    }),
  );
}

export async function fetchDayReservations(dayKey: string): Promise<ReservationView[]> {
  const { fs, db } = await loadFirestore();
  const snapshot = await fs.getDocs(
    fs.query(fs.collection(db, RESERVATIONS), fs.where('dayKey', '==', dayKey), fs.orderBy('startAt', 'asc')),
  );
  return snapshot.docs.map((docSnapshot) => mapReservationSnapshot(docSnapshot));
}

// 홈의 다음 합주 후보: 동아리 전체의 동아리방 합주. 진행 중인 합주(최대 1시간)까지 포함하도록 앞당긴다.
export async function fetchUpcomingJamReservations(now: Date = new Date()): Promise<ReservationView[]> {
  const { fs, db } = await loadFirestore();
  const from = new Date(now.getTime() - JAM_MAX_SLOTS * SLOT_MINUTES * 60_000);
  const snapshot = await fs.getDocs(
    fs.query(
      fs.collection(db, RESERVATIONS),
      fs.where('tag', '==', 'jam'),
      fs.where('startAt', '>=', fs.Timestamp.fromDate(from)),
      fs.orderBy('startAt', 'asc'),
      fs.limit(UPCOMING_JAM_LIMIT),
    ),
  );
  return snapshot.docs.map((docSnapshot) => mapReservationSnapshot(docSnapshot));
}

// 내가 잡은 예약과 초대받은 예약을 함께, 시작 시각순으로.
export async function fetchMyUpcomingReservations(ownerId: string, now: Date = new Date()): Promise<ReservationView[]> {
  const { fs, db } = await loadFirestore();
  const from = fs.Timestamp.fromDate(now);
  const [owned, invited] = await Promise.all([
    fs.getDocs(fs.query(fs.collection(db, RESERVATIONS), fs.where('ownerId', '==', ownerId), fs.where('startAt', '>=', from), fs.orderBy('startAt', 'asc'))),
    fs.getDocs(fs.query(fs.collection(db, RESERVATIONS), fs.where('participantIds', 'array-contains', ownerId), fs.where('startAt', '>=', from), fs.orderBy('startAt', 'asc'))),
  ]);
  const byId = new Map<string, ReservationView>();
  for (const docSnapshot of [...owned.docs, ...invited.docs]) byId.set(docSnapshot.id, mapReservationSnapshot(docSnapshot));
  return [...byId.values()].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
