// 합주 초대: 참여자 계산과 초대 알림 작업(pushJobs) 문서. Firebase에 의존하지 않는다.

export const MAX_PARTICIPANTS = 20;

export type InviteCollection = 'reservations' | 'events';

// 이전에 없던, 새로 초대된 회원만. 알림은 새 참여자에게만 보낸다.
export function newInvitees(previous: readonly string[], next: readonly string[]): string[] {
  const before = new Set(previous);
  return next.filter((uid) => !before.has(uid));
}

// 작성자 제외, 중복 제거, 순서 유지, 최대 인원 제한.
export function normalizeParticipants(ids: readonly string[], authorId: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!id || id === authorId || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result.slice(0, MAX_PARTICIPANTS);
}

export function buildInviteJob(
  collection: InviteCollection,
  docId: string,
  targetIds: string[],
  createdBy: string,
  createdAt: unknown,
): Record<string, unknown> {
  return { kind: 'invite', collection, docId, targetIds, createdBy, createdAt };
}

export function readParticipantIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}
