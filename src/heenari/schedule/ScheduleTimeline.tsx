import { CalendarDays, Loader2, MapPin, PencilLine, Users } from 'lucide-react';
import { TAG_LABELS } from '../reservations/policy';
import type { LoadStatus } from './useScheduleData';
import type { TimelineItem } from './types';

function participantLine(item: TimelineItem, names: Map<string, string>): string | null {
  if (item.participantIds.length === 0) return null;
  const known = item.participantIds.map((uid) => names.get(uid)).filter((name): name is string => Boolean(name));
  if (known.length === item.participantIds.length) return `함께: ${known.join(', ')}`;
  return `함께: 회원 ${item.participantIds.length}명`;
}

function ItemBody({ item, viewerId, names }: { item: TimelineItem; viewerId: string; names: Map<string, string> }) {
  const detail = [item.place, item.ownerName].filter(Boolean).join(' · ');
  const mine = item.ownerId === viewerId;
  const invited = !mine && item.participantIds.includes(viewerId);
  const together = participantLine(item, names);
  return (
    <>
      <span className="timeline-meta">
        <span className="timeline-time">{item.timeLabel}</span>
        {item.tag && <span className="timeline-tag">{TAG_LABELS[item.tag]}</span>}
        {mine && <span className="timeline-kind">내 일정</span>}
        {invited && <span className="timeline-kind">초대됨</span>}
      </span>
      <strong className="timeline-title">{item.title}</strong>
      {detail && (
        <span className="timeline-detail"><MapPin size={14} aria-hidden="true" /> {detail}</span>
      )}
      {together && (
        <span className="timeline-detail"><Users size={14} aria-hidden="true" /> {together}</span>
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
  names?: Map<string, string>;
}

const NO_NAMES = new Map<string, string>();

export function ScheduleTimeline({ items, status, viewerId, onRetry, canOpen, onOpen, names = NO_NAMES }: ScheduleTimelineProps) {

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
        return (
          <li key={`${item.kind}-${item.id}`}>
            {canOpen(item) ? (
              <button type="button" className="timeline-item" aria-label={`${item.title} 수정`} onClick={() => onOpen(item)}>
                <ItemBody item={item} viewerId={viewerId} names={names} />
                <PencilLine className="timeline-edit" size={16} aria-hidden="true" />
              </button>
            ) : (
              <div className="timeline-item">
                <ItemBody item={item} viewerId={viewerId} names={names} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
