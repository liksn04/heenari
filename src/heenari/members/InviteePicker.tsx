import { useId, useState } from 'react';
import { CheckCircle2, Search } from 'lucide-react';
import { MAX_PARTICIPANTS } from './invites';
import type { MemberView } from './memberRepository';

export interface InviteePickerProps {
  members: MemberView[];
  status: 'loading' | 'ready' | 'error';
  selected: string[];
  currentUserId: string;
  onChange: (ids: string[]) => void;
  max?: number;
}

// 합주 초대 회원 고르기: 이름 검색 + 높이가 고정된 스크롤 목록. 회원이 늘어도 모달을 밀어내지 않는다.
export function InviteePicker({ members, status, selected, currentUserId, onChange, max = MAX_PARTICIPANTS }: InviteePickerProps) {
  const [query, setQuery] = useState('');
  const labelId = useId();
  const eligible = members.filter((member) => member.uid !== currentUserId);
  const keyword = query.trim().toLowerCase();
  const filtered = keyword ? eligible.filter((member) => member.name.toLowerCase().includes(keyword)) : eligible;
  const chosen = new Set(selected);
  const full = selected.length >= max;

  function toggle(uid: string) {
    onChange(chosen.has(uid) ? selected.filter((id) => id !== uid) : [...selected, uid]);
  }

  return (
    <div className="field-block invitee-picker" role="group" aria-labelledby={labelId}>
      <span id={labelId}>함께할 회원 (선택)</span>
      {status === 'loading' ? (
        <p className="field-hint">회원 목록을 불러오고 있어요…</p>
      ) : status === 'error' ? (
        <p className="field-hint">회원 목록을 불러오지 못했어요. 초대 없이도 저장할 수 있어요.</p>
      ) : eligible.length === 0 ? (
        <p className="field-hint">아직 초대할 수 있는 회원이 없어요. 한 번 이상 로그인한 회원만 보여요.</p>
      ) : (
        <>
          <label className="invitee-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="이름으로 검색"
              aria-label="회원 이름으로 검색"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {filtered.length === 0 ? (
            <p className="invitee-empty">검색 결과가 없어요.</p>
          ) : (
            <ul className="invitee-list" aria-label="초대할 회원">
              {filtered.map((member) => {
                const checked = chosen.has(member.uid);
                return (
                  <li key={member.uid}>
                    <label className="invitee-row" data-checked={checked}>
                      <input
                        type="checkbox"
                        className="visually-hidden"
                        aria-label={member.name}
                        checked={checked}
                        disabled={!checked && full}
                        onChange={() => toggle(member.uid)}
                      />
                      <span className="invitee-avatar" aria-hidden="true">{member.name.slice(0, 1)}</span>
                      <span className="invitee-name">{member.name}</span>
                      {checked && <CheckCircle2 className="invitee-check" size={20} aria-hidden="true" />}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {selected.length > 0 && <p className="invitee-count">{selected.length}명 선택됨</p>}
        </>
      )}
    </div>
  );
}
