import { useCallback, useEffect, useState } from 'react';
import { fetchMemberProfile } from './memberRepository';
import type { ProfileData } from './profile';

export interface UseMyProfile {
  status: 'loading' | 'ready' | 'error';
  profile: ProfileData | null;
  replace: (profile: ProfileData) => void; // 저장 직후 다시 읽지 않고 반영
}

export function useMyProfile(uid: string): UseMyProfile {
  const [state, setState] = useState<{ status: UseMyProfile['status']; profile: ProfileData | null }>({ status: 'loading', profile: null });

  useEffect(() => {
    let active = true;
    fetchMemberProfile(uid)
      .then((profile) => { if (active) setState({ status: 'ready', profile }); })
      .catch(() => { if (active) setState({ status: 'error', profile: null }); });
    return () => { active = false; };
  }, [uid]);

  const replace = useCallback((profile: ProfileData) => setState({ status: 'ready', profile }), []);
  return { ...state, replace };
}
