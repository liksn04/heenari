import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { resolveGoogleMember, type MemberProfile } from './access';
import { getFirebaseServices, hasFirebaseConfig } from '../lib/firebase';
import { fetchIsAdmin } from '../admin/adminAccess';
import { AuthContext, type AuthContextValue, type AuthStatus } from './authState';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => hasFirebaseConfig() ? 'booting' : 'setup-error');
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!hasFirebaseConfig()) return;
    const services = getFirebaseServices();

    return onAuthStateChanged(services.auth, async (nextUser) => {
      setUser(nextUser);
      setMember(null);

      if (!nextUser) {
        setStatus('signed-out');
        return;
      }

      const access = resolveGoogleMember({
        email: nextUser.email,
        emailVerified: nextUser.emailVerified,
        displayName: nextUser.displayName,
        providerIds: nextUser.providerData.map((provider) => provider.providerId),
      });

      if (access.status === 'allowed') {
        setMember(access.member);
        setStatus('allowed');
        // 역할 표시는 진입을 막지 않고 뒤따라 반영한다. 실제 권한 경계는 Rules다.
        fetchIsAdmin(nextUser.uid)
          .then((isAdmin) => {
            if (!isAdmin || services.auth.currentUser?.uid !== nextUser.uid) return;
            setMember((current) => (current ? { ...current, role: 'admin' } : current));
          })
          .catch((error: unknown) => console.warn('관리자 여부를 확인하지 못했습니다.', error));
        return;
      }

      setNotice('검증된 Google 계정으로 로그인해주세요.');
      await firebaseSignOut(services.auth);
    });
  }, []);

  const loginWithGoogle = useCallback(async (rememberMe: boolean) => {
    setNotice(null);
    try {
      const { auth } = getFirebaseServices();
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence,
      );
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error('Google 로그인 요청이 실패했습니다.', error);
      throw new Error('Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
  }, []);

  const signOut = useCallback(async () => {
    const { auth } = getFirebaseServices();
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    member,
    notice,
    loginWithGoogle,
    signOut,
    clearNotice: () => setNotice(null),
  }), [loginWithGoogle, member, notice, signOut, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
