import { ChevronRight, Guitar, MapPin, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { dayKeyOf } from '../reservations/slots';
import { spansMultipleDays } from '../schedule/eventPolicy';
import { dayLabel } from '../schedule/timeline';
import type { TimelineItem } from '../schedule/types';
import type { Loaded } from '../schedule/useScheduleData';

function whenLabel(jam: TimelineItem, now: Date): string {
  const range = jam.kind === 'event' && spansMultipleDays(jam.event) ? jam.timeLabel : `${dayLabel(dayKeyOf(jam.startAt))} · ${jam.timeLabel}`;
  return jam.startAt.getTime() <= now.getTime() ? `진행 중 · ${range}` : range;
}

// 잡은 사람과 초대된 회원. 명부에 없는 회원은 수로만 센다.
function peopleLabel(jam: TimelineItem, names: Map<string, string>): string | null {
  const host = jam.ownerName ?? names.get(jam.ownerId) ?? null;
  const known = jam.participantIds.map((uid) => names.get(uid)).filter((name): name is string => Boolean(name));
  const guests = known.length === jam.participantIds.length ? known.join(', ') : `회원 ${jam.participantIds.length}명`;
  if (!host) return jam.participantIds.length > 0 ? `함께: ${guests}` : null;
  return jam.participantIds.length > 0 ? `${host} · 함께: ${guests}` : host;
}

// 홈 최상단 강조 카드: 동아리 전체의 다음 합주.
export function NextJamCard({ next, names, now = new Date() }: { next: Loaded<TimelineItem | null>; names: Map<string, string>; now?: Date }) {
  const jam = next.data;
  const people = jam ? peopleLabel(jam, names) : null;
  return (
    <section className="next-event-card" aria-label="다음 합주">
      <div>
        <p className="card-kicker"><Sparkles size={15} /> 다음 합주</p>
        {jam ? (
          <>
            <h2>{jam.title}</h2>
            <p className="next-event-when">{whenLabel(jam, now)}</p>
            {jam.place && <p><MapPin size={13} aria-hidden="true" /> {jam.place}</p>}
            {people && <p><Users size={13} aria-hidden="true" /> {people}</p>}
            <Link className="next-event-link" to={`/schedule?day=${dayKeyOf(jam.startAt)}`}>
              일정에서 보기 <ChevronRight size={15} aria-hidden="true" />
            </Link>
          </>
        ) : next.status === 'error' ? (
          <>
            <h2>합주를 불러오지 못했어요</h2>
            <p>잠시 후 일정 화면에서 다시 확인해주세요.</p>
          </>
        ) : (
          <>
            <h2>{next.status === 'loading' ? '다음 합주를 확인하고 있어요' : '예정된 합주가 없어요'}</h2>
            <p>일정에서 합주를 잡으면 가장 먼저 이곳에 보여드려요.</p>
          </>
        )}
      </div>
      <Guitar size={34} strokeWidth={1.4} aria-hidden="true" />
    </section>
  );
}
