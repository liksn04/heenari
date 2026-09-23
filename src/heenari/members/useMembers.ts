import { useEffect, useState } from 'react';
import { fetchMembers, type MemberView } from './memberRepository';

export interface UseMembers {
  status: 'loading' | 'ready' | 'error';
  members: MemberView[];
  names: Map<string, string>;
}

// 40명 미만 동아리라 명부 전체를 한 번 불러온다.
export function useMembers(): UseMembers {
  const [state, setState] = useState<{ status: UseMembers['status']; members: MemberView[] }>({ status: 'loading', members: [] });

  useEffect(() => {
    let active = true;
    fetchMembers()
      .then((members) => { if (active) setState({ status: 'ready', members }); })
      .catch(() => { if (active) setState({ status: 'error', members: [] }); });
    return () => { active = false; };
  }, []);

  return { ...state, names: new Map(state.members.map((member) => [member.uid, member.name])) };
}
