import { useLoader, type Loaded } from '../schedule/useScheduleData';
import { fetchNotices } from './noticeRepository';
import type { NoticeView } from './notice';

const EMPTY: NoticeView[] = [];

// 최신 공지 max개. version을 올리면 다시 불러온다.
export function useNotices(max: number, version = 0): Loaded<NoticeView[]> {
  return useLoader(`notices#${max}#${version}`, () => fetchNotices(max), EMPTY);
}
