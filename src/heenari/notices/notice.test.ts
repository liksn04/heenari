import { describe, expect, it } from 'vitest';
import { NOTICE_LIMITS, noticeDateLabel, noticeValidationMessage, normalizeNotice } from './notice';

describe('normalizeNotice', () => {
  it('앞뒤 공백을 걷고 본문 줄바꿈은 둔다', () => {
    expect(normalizeNotice({ title: ' 회의 ', body: '  첫 줄\n둘째 줄  ' })).toEqual({ title: '회의', body: '첫 줄\n둘째 줄' });
  });

  it('제목·내용 길이를 경계값까지 검증한다', () => {
    expect(normalizeNotice({ title: 'a'.repeat(NOTICE_LIMITS.titleMax), body: 'b'.repeat(NOTICE_LIMITS.bodyMax) })).not.toBeTypeOf('string');
    expect(normalizeNotice({ title: '   ', body: 'b' })).toBe('title');
    expect(normalizeNotice({ title: 'a'.repeat(61), body: 'b' })).toBe('title');
    expect(normalizeNotice({ title: 't', body: ' \n ' })).toBe('body');
    expect(normalizeNotice({ title: 't', body: 'b'.repeat(1001) })).toBe('body');
  });

  it('안내 문구와 KST 날짜', () => {
    expect(noticeValidationMessage('title')).toBe('제목을 1~60자로 입력해주세요.');
    expect(noticeValidationMessage('body')).toBe('내용을 1~1000자로 입력해주세요.');
    expect(noticeDateLabel(new Date('2026-09-23T16:00:00.000Z'))).toBe('9월 24일');
  });
});
