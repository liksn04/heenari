// 알림 판단 로직. 네트워크·Firestore에 의존하지 않는다.

export type Collection = 'reservations' | 'events';

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushJob {
  id: string;
  kind: string;
  collection: string;
  docId: string;
  targetIds: string[];
  createdBy: string;
}

// Worker가 읽은 예약·일정 문서(필요한 필드만).
export interface JamDoc {
  collection: Collection;
  id: string;
  title: string;
  authorId: string; // reservations.ownerId / events.createdBy
  authorName: string | null; // reservations.ownerName
  startAt: Date;
  tag: string | null;
  participantIds: string[];
  location: string | null; // events.location (예약은 동아리방)
  dayKey: string | null;
}

export const REMINDER_WINDOW_MS = 60 * 60 * 1000;
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const ROOM_NAME = '동아리방';

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

function seoul(date: Date) {
  const shifted = new Date(date.getTime() + SEOUL_OFFSET_MS);
  return {
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    time: `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`,
    dayKey: `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`,
  };
}

function scheduleUrl(doc: JamDoc): string {
  return `/schedule?day=${doc.dayKey ?? seoul(doc.startAt).dayKey}`;
}

// 작업이 가리키는 문서가 있고, 작업 작성자가 문서 작성자이며, 지금도 참여자인 회원에게만 보낸다.
// (Rules가 생성 시 확인하지만 Worker는 IAM으로 Rules를 우회하므로 다시 확인한다.)
export function inviteTargets(job: PushJob, doc: JamDoc | null): string[] {
  if (job.kind !== 'invite') return [];
  if (job.collection !== 'reservations' && job.collection !== 'events') return [];
  if (!doc || doc.collection !== job.collection || doc.id !== job.docId) return [];
  if (doc.authorId !== job.createdBy) return [];
  const current = new Set(doc.participantIds);
  return [...new Set(job.targetIds)].filter((uid) => current.has(uid) && uid !== doc.authorId);
}

export function inviteMessage(doc: JamDoc, authorName: string): PushMessage {
  const { month, day, time } = seoul(doc.startAt);
  return {
    title: '합주 초대',
    body: `${authorName}님이 ${month}월 ${day}일 ${time} 합주에 초대했어요. ${doc.title}`,
    url: scheduleUrl(doc),
    tag: `invite-${doc.id}`,
  };
}

export interface Reminder {
  key: string; // pushLog 문서 ID. 시작 시각이 바뀌면 새 키가 된다.
  recipients: string[];
  message: PushMessage;
}

// 1시간 안에 시작하는 합주(jam). 1시간 전을 놓쳤거나 늦게 잡힌 합주는 남은 시간으로 알린다.
export function reminderFor(doc: JamDoc, now: Date): Reminder | null {
  if (doc.tag !== 'jam') return null;
  const untilStart = doc.startAt.getTime() - now.getTime();
  if (untilStart <= 0 || untilStart > REMINDER_WINDOW_MS) return null;
  const minutes = Math.ceil(untilStart / 60000);
  const place = doc.collection === 'reservations' ? ROOM_NAME : doc.location;
  const { time } = seoul(doc.startAt);
  return {
    key: `reminder_${doc.collection}_${doc.id}_${doc.startAt.getTime()}`,
    recipients: [...new Set([doc.authorId, ...doc.participantIds])],
    message: {
      title: minutes >= 55 ? '합주 1시간 전' : `합주 ${minutes}분 전`,
      body: [`${time} ${doc.title}`, place].filter(Boolean).join(' · '),
      url: scheduleUrl(doc),
      tag: `reminder-${doc.id}`,
    },
  };
}
