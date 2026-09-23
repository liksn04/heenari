import { createContext, useContext } from 'react';
import type { User } from 'firebase/auth';
import type { MemberProfile } from './access';

export type AuthStatus = 'booting' | 'signed-out' | 'allowed' | 'setup-error';

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  member: MemberProfile | null;
  notice: string | null;
  loginWithGoogle: (rememberMe: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  clearNotice: () => void;
  updateMemberName: (name: string) => void; // 프로필 저장 직후 화면 이름 반영
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useHeenariAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useHeenariAuth는 AuthProvider 안에서 사용해야 합니다.');
  return context;
}
