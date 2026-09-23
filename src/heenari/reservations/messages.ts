import type { DraftInvalidReason } from './repository';

export function validationMessage(reason: DraftInvalidReason): string {
  switch (reason) {
    case 'empty':
      return '예약할 시간을 선택해주세요.';
    case 'too-many':
      return '동아리방은 하루 운영 시간(09:00–24:00) 안에서만 예약할 수 있어요.';
    case 'jam-too-long':
      return '합주는 한 번에 최대 1시간까지 예약할 수 있어요.';
    case 'not-contiguous':
    case 'mixed-day':
      return '연속된 시간만 예약할 수 있어요.';
    case 'title':
      return '제목을 1~40자로 입력해주세요.';
    case 'note':
      return '메모는 200자 이하로 입력해주세요.';
    case 'out-of-window':
      return '오늘부터 60일 이내 날짜만 예약할 수 있어요.';
    case 'past':
      return '이미 지난 시간은 예약할 수 없어요.';
    default:
      return '예약 정보를 다시 확인해주세요.';
  }
}
