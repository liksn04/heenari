import { CalendarDays, Loader2, MapPin, PencilLine } from 'lucide-react';
import { TAG_LABELS } from '../reservations/policy';
import type { LoadStatus } from './useScheduleData';
import type { TimelineItem } from './types';

function ItemBody({ item, mine }: { item: TimelineItem; mine: boolean }) {
  const detail = [item.place, item.ownerName].filter(Boolean).join(' · ');
  return (
    <>
      <span className="timeline-meta">
        <span className="timeline-time">{item.timeLabel}</span>
        {item.tag && <span className="timeline-tag">{TAG_LABELS[item.tag]}</span>}
        {mine && <span className="timeline-kind">내 일정</span>}
      </span>
      <strong className="timeline-title">{item.title}</strong>
      {detail && (
        <span className="timeline-detail"><MapPin size={14} aria-hidden="true" /> {detail}</span>
      )}
    </>
  );
}

export interface ScheduleTimelineProps {
  items: TimelineItem[];
  status: LoadStatus;
  viewerId: string;
  onRetry: () => void;
  canOpen: (item: TimelineItem) => boolean;
  onOpen: (item: TimelineItem) => void;
}

export function ScheduleTimeline({ items, status, viewerId, onRetry, canOpen, onOpen }: ScheduleTimelineProps) {
  if (status === 'loading') {
    return <p className="muted-line"><Loader2 size={15} aria-hidden="true" /> 일정을 불러오고 있어요…</p>;
  }

  if (status === 'error') {
    return (
      <p className="form-message" role="status" data-tone="error">
        일정을 불러오지 못했어요.
        <button type="button" className="link-button" onClick={onRetry}>다시 시도</button>
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-state compact-empty">
        <CalendarDays size={22} aria-hidden="true" />
        <div>
          <strong>이 날은 일정이 없어요</strong>
          <p>일정 추가로 동아리방 시간이나 동아리 일정을 등록하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <ul className="timeline-list" aria-label="선택일 일정">
      {items.map((item) => {
        const mine = item.ownerId === viewerId;
        return (
          <li key={`${item.kind}-${item.id}`}>
            {canOpen(item) ? (
              <button type="button" className="timeline-item" aria-label={`${item.title} 수정`} onClick={() => onOpen(item)}>
                <ItemBody item={item} mine={mine} />
                <PencilLine className="timeline-edit" size={16} aria-hidden="true" />
              </button>
            ) : (
              <div className="timeline-item">
                <ItemBody item={item} mine={mine} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
