import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useOnlineStatus } from '../reservations/useOnlineStatus';
import { ProfileValidationError, updateMemberProfile } from './memberRepository';
import { useMembers } from './useMembers';
import { hasSameName, PROFILE_LIMITS, type ProfileData } from './profile';

export interface ProfileSheetProps {
  uid: string;
  initial: ProfileData;
  onClose: () => void;
  onSaved: (profile: ProfileData) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof ProfileValidationError) {
    return error.reason === 'name' ? `이름을 1~${PROFILE_LIMITS.nameMax}자로 입력해주세요.` : `한줄소개는 ${PROFILE_LIMITS.bioMax}자 이하로 입력해주세요.`;
  }
  return '프로필을 저장하지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.';
}

// 내 프로필 편집: 이름(실명)과 한줄소개. 같은 이름의 회원이 있으면 동명이인 확인을 받는다.
export function ProfileSheet({ uid, initial, onClose, onSaved }: ProfileSheetProps) {
  const [name, setName] = useState(initial.name);
  const [bio, setBio] = useState(initial.bio ?? '');
  const [sameNameConfirmed, setSameNameConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();
  const members = useMembers();
  const duplicate = hasSameName(name, members.members, uid);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setBusy(true);
    setMessage(null);
    let saved: ProfileData | null = null;
    try {
      saved = await updateMemberProfile(uid, { name, bio });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
    // 저장이 끝난 뒤의 화면 반영은 저장 실패 안내와 섞지 않는다.
    if (saved) onSaved(saved);
  }

  const blockedByDuplicate = duplicate && !sameNameConfirmed;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label="프로필 편집" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <p className="eyebrow">PROFILE</p>
            <h2>프로필 편집</h2>
          </div>
          <button type="button" className="round-button" aria-label="닫기" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="modal-body">
          <form
            className="reserve-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="field-block">
              <span>이름</span>
              <input
                type="text"
                value={name}
                maxLength={PROFILE_LIMITS.nameMax}
                placeholder="실명을 입력해주세요"
                onChange={(event) => {
                  setName(event.target.value);
                  setSameNameConfirmed(false);
                  setMessage(null);
                }}
              />
            </label>
            <p className="field-hint">동아리에서는 실명을 써주세요. 회원들이 합주 초대할 때 서로 알아볼 수 있어요.</p>

            {duplicate && (
              <label className="same-name-check">
                <input type="checkbox" checked={sameNameConfirmed} onChange={(event) => setSameNameConfirmed(event.target.checked)} />
                <span>같은 이름의 회원이 있어요. 동명이인이 맞아요.</span>
              </label>
            )}

            <label className="field-block">
              <span>한줄소개 (선택)</span>
              <input
                type="text"
                value={bio}
                maxLength={PROFILE_LIMITS.bioMax}
                placeholder="예: 주말 합주 언제든 환영"
                onChange={(event) => {
                  setBio(event.target.value);
                  setMessage(null);
                }}
              />
            </label>

            {message && <p className="form-message" role="status" data-tone="error">{message}</p>}

            <div className="reserve-cta" role="group" aria-label="프로필 저장">
              {!online && <p className="offline-note">오프라인 상태에서는 저장할 수 없어요.</p>}
              <button type="submit" className="primary-button" disabled={busy || !online || blockedByDuplicate}>
                {busy ? '저장하고 있어요' : '저장'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
