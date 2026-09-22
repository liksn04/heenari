import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'heenari-lite-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'events', 'event-1'), { title: '정기 모임' });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('protected data rules', () => {
  it('이메일이 검증된 인증 사용자만 동아리 일정을 읽는다', async () => {
    const verifiedDb = testEnv.authenticatedContext('verified-user', {
      email: 'member@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();
    const unverifiedDb = testEnv.authenticatedContext('unverified-user', {
      email: 'member@example.com',
      email_verified: false,
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();
    const guestDb = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(verifiedDb, 'events', 'event-1')));
    await assertFails(getDoc(doc(unverifiedDb, 'events', 'event-1')));
    await assertFails(getDoc(doc(guestDb, 'events', 'event-1')));
  });

  it('이메일이 검증돼도 Google 이외 provider는 읽을 수 없다', async () => {
    const passwordDb = testEnv.authenticatedContext('password-user', {
      email: 'member@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    }).firestore();

    await assertFails(getDoc(doc(passwordDb, 'events', 'event-1')));
  });

  it('Gate 1에서는 보호 컬렉션 쓰기를 기본 거부한다', async () => {
    const db = testEnv.authenticatedContext('verified-user', {
      email: 'member@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();
    await assertFails(setDoc(doc(db, 'events', 'new-event'), { title: '임의 일정' }));
    await assertFails(setDoc(doc(db, 'reservations', 'new-reservation'), { ownerId: 'active-member' }));
  });
});
