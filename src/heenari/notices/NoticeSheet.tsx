import { useEffect, useState } from 'react';
import { Pencil, Trash2, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../reservations/useOnlineStatus';
import { NOTICE_LIMITS, noticeDateLabel, noticeValidationMessage, type NoticeView } from './notice';
import { createNotice, deleteNotice, NoticeValidationError, updateNotice } from './noticeRepository';

export type NoticeSheetMode = { kind: 'view'; notice: NoticeView } | { kind: 'create' };

export interface NoticeSheetProps {
  mode: NoticeSheetMode;
  canManage: boolean; // 운영진만 쓰기·수정·삭제
  author: { uid: string; name: string };
  onClose: () => void;
  onChanged: (message: string) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof NoticeValidationError) return noticeValidationMessage(error.reason);
  if ((error as { code?: string } | null)?.code === 'permission-denied') return '공지는 운영진만 쓸 수 있어요.';
  return '저장하지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.';
}

// 공지 읽기, 그리고 운영진의 작성·수정·삭제를 한 시트에서.
export function NoticeSheet({ mode, canManage, author, onClose, onChanged }: NoticeSheetProps) {
  const notice = mode.kind === 'view' ? mode.notice : null;
  const [editing, setEditing] = useState(mode.kind === 'create');
  const [title, setTitle] = useState(notice?.title ?? '');
  const [body, setBody] = useState(notice?.body ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const online = useOnlineStatus();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    let done = false;
    try {
      await action();
      done = true;
    } catch (error) {
      setMessage(errorMessage(error));
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
    if (done) onChanged(success);
  }

  function save() {
    const input = { title, body };
    void run(
      () => (notice ? updateNotice(notice.id, input) : createNotice(input, author)),
      notice ? '공지를 고쳤어요.' : '공지를 올렸어요.',
    );
  }

  const disabled = busy || !online;
  const heading = editing ? (notice ? '공지 수정' : '공지 쓰기') : '동아리 공지';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label={heading} onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <p className="eyebrow">NOTICE</p>
            <h2>{heading}</h2>
          </div>
          <button type="button" className="round-button" aria-label="닫기" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="modal-body">
          {editing ? (
            <form
              className="reserve-form"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <label className="field-block">
                <span>제목</span>
                <input
                  type="text"
                  value={title}
                  maxLength={NOTICE_LIMITS.titleMax}
                  placeholder="예: 이번 주 정기 회의 안내"
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setMessage(null);
                  }}
                />
              </label>
              <label className="field-block">
                <span>내용</span>
                <textarea
                  value={body}
                  maxLength={NOTICE_LIMITS.bodyMax}
                  rows={8}
                  placeholder="회원들에게 알릴 내용을 적어주세요."
                  onChange={(event) => {
                    setBody(event.target.value);
                    setMessage(null);
                  }}
                />
              </label>

              {message && <p className="form-message" role="status" data-tone="error">{message}</p>}

              <div className="reserve-cta" role="group" aria-label={`${heading} 확정`}>
                {!online && <p className="offline-note"><WifiOff size={15} aria-hidden="true" /> 오프라인 상태에서는 저장할 수 없어요.</p>}
                <button type="submit" className="primary-button" disabled={disabled}>
                  {busy ? '저장하고 있어요' : notice ? '저장' : '공지 올리기'}
                </button>
              </div>
            </form>
          ) : notice && (
            <article className="notice-detail">
              <h3>{notice.title}</h3>
              <p className="notice-meta">{noticeDateLabel(notice.createdAt)} · {notice.authorName}</p>
              <p className="notice-body">{notice.body}</p>

              {message && <p className="form-message" role="status" data-tone="error">{message}</p>}

              {canManage && (
                <div className="reserve-cta" role="group" aria-label="공지 관리">
                  {confirmingDelete ? (
                    <div className="confirm-row">
                      <p>이 공지를 삭제할까요? 되돌릴 수 없어요.</p>
                      <button type="button" className="danger-button" disabled={disabled} onClick={() => void run(() => deleteNotice(notice.id), '공지를 삭제했어요.')}>
                        {busy ? '삭제하고 있어요' : '삭제 확정'}
                      </button>
                      <button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmingDelete(false)}>
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="cta-actions">
                      <button type="button" className="secondary-button" disabled={disabled} onClick={() => setConfirmingDelete(true)}>
                        <Trash2 size={17} aria-hidden="true" /> 삭제
                      </button>
                      <button type="button" className="primary-button" disabled={disabled} onClick={() => setEditing(true)}>
                        <Pencil size={17} aria-hidden="true" /> 수정
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
