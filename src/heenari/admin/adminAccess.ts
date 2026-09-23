import { getFirebaseDb } from '../lib/firebase';

// 관리자 판정의 유일한 신뢰 소스는 Console에서만 쓰는 admins/{uid} 문서다.
// 화면 표시용 확인이며, 실제 권한 경계는 firestore.rules의 isAdmin()이다.
export async function fetchIsAdmin(uid: string): Promise<boolean> {
  const [fs, db] = await Promise.all([import('firebase/firestore'), getFirebaseDb()]);
  const snapshot = await fs.getDoc(fs.doc(db, 'admins', uid));
  return snapshot.exists();
}
