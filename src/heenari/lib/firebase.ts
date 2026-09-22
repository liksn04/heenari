import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
}

let services: FirebaseServices | null = null;

export function hasFirebaseConfig() {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID,
  );
}

export class FirebaseSetupError extends Error {
  constructor() {
    super('Firebase 환경 변수가 설정되지 않았습니다.');
    this.name = 'FirebaseSetupError';
  }
}

export function getFirebaseServices(): FirebaseServices {
  if (services) return services;

  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };

  if (!hasFirebaseConfig()) {
    throw new FirebaseSetupError();
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  services = { app, auth: getAuth(app) };
  return services;
}

export async function getFirebaseDb() {
  const { getFirestore } = await import('firebase/firestore');
  return getFirestore(getFirebaseServices().app);
}
