import { dayKeyOf } from '../reservations/slots';

// notices/{noticeId}: 운영진만 쓰고 회원은 읽는 동아리 공지. firestore.rules noticeShape와 맞춘다.
export const NOTICE_LIMITS = { titleMax: 60, bodyMax: 1000 } as const;

export interface NoticeView {
  id: string;
  title: string; // 1..60
  body: string; // 1..1000, 줄바꿈 유지
  authorId: string;
  authorName: string; // 작성 당시 이름 스냅샷
  createdAt: Date;
  updatedAt: Date;
}

export interface NoticeInput {
  title: string;
  body: string;
}

export type NoticeError = 'title' | 'body';

// 앞뒤 공백만 걷어내고 본문 안의 줄바꿈은 그대로 둔다.
export function normalizeNotice(input: NoticeInput): NoticeInput | NoticeError {
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 1 || title.length > NOTICE_LIMITS.titleMax) return 'title';
  if (body.length < 1 || body.length > NOTICE_LIMITS.bodyMax) return 'body';
  return { title, body };
}

export function noticeValidationMessage(reason: NoticeError): string {
  return reason === 'title'
    ? `제목을 1~${NOTICE_LIMITS.titleMax}자로 입력해주세요.`
    : `내용을 1~${NOTICE_LIMITS.bodyMax}자로 입력해주세요.`;
}

// '9월 24일' (KST)
export function noticeDateLabel(date: Date): string {
  const [, month, day] = dayKeyOf(date).split('-').map(Number);
  return `${month}월 ${day}일`;
}
