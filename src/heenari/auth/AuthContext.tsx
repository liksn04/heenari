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
