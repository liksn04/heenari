import { describe, expect, it } from 'vitest';
import { validationMessage } from './messages';
import type { DraftInvalidReason } from './repository';

describe('validationMessage', () => {
  const cases: [DraftInvalidReason, RegExp][] = [
    ['empty', /시간을 선택/],
    ['too-many', /최대 4시간/],
    ['not-contiguous', /연속된 시간/],
    ['mixed-day', /연속된 시간/],
    ['duplicate', /다시 확인/],
    ['title', /제목/],
    ['note', /메모/],
    ['out-of-window', /60일/],
    ['past', /지난 시간/],
  ];

  it.each(cases)('%s 사유에 맞는 안내를 반환한다', (reason, pattern) => {
    expect(validationMessage(reason)).toMatch(pattern);
  });
});
