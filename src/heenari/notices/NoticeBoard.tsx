import { useState } from 'react';
import { ChevronLeft, ChevronRight, Megaphone, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useHeenariAuth } from '../auth/authState';
import { noticeDateLabel } from './notice';
import { NoticeSheet, type NoticeSheetMode } from './NoticeSheet';
import { useNotices } from './useNotices';

export const HOME_NOTICE_LIMIT = 3;
export const ALL_NOTICE_LIMIT = 50;

// 동아리 공지 목록. 홈에서는 최신 몇 개와 전체 보기 링크, 공지 화면에서는 전체.
export function NoticeBoard({ variant }: { variant: 'home' | 'page' }) {
  const { user, member } = useHeenariAuth();
  const canManage = member?.role === 'admin';
  const [version, setVersion] = useState(0);
  const [sheet, setSheet] = useState<NoticeSheetMode | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const notices = useNotices(variant === 'home' ? HOME_NOTICE_LIMIT : ALL_NOTICE_LIMIT, version);

  const heading = variant === 'home' ? (
    <div className="section-heading">
      <div>
        <p className="eyebrow">NOTICE</p>
        <h2>동아리 공지</h2>
      </div>
      <Link className="round-button" to="/notices" aria-label="공지 전체 보기"><ChevronRight /></Link>
    </div>
  ) : (
    <div className="section-heading">
      <div>
        <p className="eyebrow">NOTICE</p>
        <h1>동아리 공지</h1>
      </div>
      <Link className="round-button" to="/" aria-label="홈으로"><ChevronLeft /></Link>
    </div>
  );

  return (
    <section className={variant === 'home' ? 'section-block' : 'section-block notice-page'} aria-label="동아리 공지">
      {heading}

      {canManage && (
        <button type="button" className="secondary-button compact notice-write" onClick={() => { setFlash(null); setSheet({ kind: 'create' }); }}>
          <Plus size={17} aria-hidden="true" /> 공지 쓰기
        </button>
      )}
      {flash && <p className="form-message" role="status" data-tone="success">{flash}</p>}

      {notices.status === 'error' ? (
        <p className="form-message" role="status" data-tone="error">
          공지를 불러오지 못했어요.
          <button type="button" className="link-button" onClick={() => void notices.refresh()}>다시 시도</button>
        </p>
      ) : notices.data.length > 0 ? (
        <ul className="notice-list" aria-label="공지 목록">
          {notices.data.map((notice) => (
            <li key={notice.id}>
              <button type="button" className="notice-item" onClick={() => { setFlash(null); setSheet({ kind: 'view', notice }); }}>
                <strong>{notice.title}</strong>
                <span className="notice-meta">{noticeDateLabel(notice.createdAt)} · {notice.authorName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state compact-empty">
          <Megaphone size={25} aria-hidden="true" />
          <div>
            <strong>{notices.status === 'loading' ? '공지를 확인하고 있어요' : '아직 올라온 공지가 없어요'}</strong>
            <p>운영진이 공지를 올리면 이곳에서 볼 수 있어요.</p>
          </div>
        </div>
      )}

      {sheet && (
        <NoticeSheet
          mode={sheet}
          canManage={canManage}
          author={{ uid: user?.uid ?? '', name: member?.name ?? '운영진' }}
          onClose={() => setSheet(null)}
          onChanged={(message) => {
            setSheet(null);
            setFlash(message);
            setVersion((current) => current + 1);
          }}
        />
      )}
    </section>
  );
}
