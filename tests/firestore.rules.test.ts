import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

// 30분 경계에 맞는 미래 시각 (dayKey/slotId와 일치)
const START = new Date(Date.UTC(2030, 0, 1, 0, 0, 0)); // 2030-01-01 09:00 KST
const END = new Date(START.getTime() + 30 * 60 * 1000);
const DAY_KEY = '2030-01-01';
const SLOT_ID = '2030-01-01_09-00';

function googleUser(uid: string) {
  return { email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: 'google.com' } };
}

function reservationCreatePayload(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    title: '합주',
    note: null,
    ownerId: uid,
    ownerName: '김희나',
    startAt: Timestamp.fromDate(START),
    endAt: Timestamp.fromDate(END),
    dayKey: DAY_KEY,
    slotIds: [SLOT_ID],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function seededReservation(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    title: '합주',
    note: null,
    ownerId: uid,
    ownerName: '김희나',
    startAt: Timestamp.fromDate(START),
    endAt: Timestamp.fromDate(END),
    dayKey: DAY_KEY,
    slotIds: [SLOT_ID],
    createdAt: Timestamp.fromDate(new Date(Date.UTC(2029, 0, 1))),
    updatedAt: Timestamp.fromDate(new Date(Date.UTC(2029, 0, 1))),
    ...overrides,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'heenari-lite-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'events', 'event-1'), { title: '정기 모임' });
    await setDoc(doc(db, 'reservations', 'owned'), seededReservation('member-a'));
    await setDoc(doc(db, 'reservationSlots', SLOT_ID), {
      reservationId: 'owned',
      ownerId: 'member-a',
      dayKey: DAY_KEY,
      startsAt: Timestamp.fromDate(START),
      createdAt: Timestamp.fromDate(new Date(Date.UTC(2029, 0, 1))),
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('공통 접근 제어', () => {
  it('비로그인 사용자는 예약을 읽거나 쓸 수 없다', async () => {
    const guest = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(guest, 'reservations', 'owned')));
    await assertFails(setDoc(doc(guest, 'reservations', 'x'), reservationCreatePayload('guest')));
  });

  it('검증되지 않은 이메일과 Google 외 provider는 거부된다', async () => {
    const unverified = testEnv.authenticatedContext('u', { email_verified: false, firebase: { sign_in_provider: 'google.com' } }).firestore();
    const password = testEnv.authenticatedContext('p', { email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
    await assertFails(getDoc(doc(unverified, 'reservations', 'owned')));
    await assertFails(getDoc(doc(password, 'reservations', 'owned')));
  });

  it('events와 settings 쓰기는 계속 거부된다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertFails(setDoc(doc(db, 'events', 'e2'), { title: '임의' }));
    await assertFails(setDoc(doc(db, 'settings', 'club'), { name: '희나리' }));
  });
});

describe('예약 create', () => {
  it('검증된 회원은 본인 예약을 만들 수 있다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertSucceeds(setDoc(doc(db, 'reservations', 'r-new'), reservationCreatePayload('member-b')));
  });

  it('다른 사용자를 ownerId로 지정하면 거부된다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertFails(setDoc(doc(db, 'reservations', 'r-bad'), reservationCreatePayload('someone-else')));
  });

  it('알 수 없는 필드를 포함하면 거부된다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertFails(setDoc(doc(db, 'reservations', 'r-extra'), reservationCreatePayload('member-b', { role: 'admin' })));
  });

  it('과도한 제목/슬롯 배열은 거부된다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertFails(setDoc(doc(db, 'reservations', 'r-title'), reservationCreatePayload('member-b', { title: '가'.repeat(41) })));
    await assertFails(setDoc(doc(db, 'reservations', 'r-slots'), reservationCreatePayload('member-b', {
      slotIds: Array.from({ length: 9 }, (_, i) => `${DAY_KEY}_slot-${i}`),
    })));
  });
});

describe('예약 update / delete', () => {
  it('본인 미래 예약의 제목은 수정할 수 있다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertSucceeds(updateDoc(doc(db, 'reservations', 'owned'), { title: '새 제목', updatedAt: serverTimestamp() }));
  });

  it('ownerId나 createdAt은 변경할 수 없다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertFails(updateDoc(doc(db, 'reservations', 'owned'), { ownerId: 'member-a2', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'reservations', 'owned'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });

  it('다른 사용자는 남의 예약을 수정·삭제할 수 없다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertFails(updateDoc(doc(db, 'reservations', 'owned'), { title: '침입', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'reservations', 'owned')));
  });

  it('본인 미래 예약은 삭제할 수 있다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'reservations', 'owned')));
  });
});

describe('슬롯 규칙', () => {
  it('슬롯 문서는 수정할 수 없다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertFails(updateDoc(doc(db, 'reservationSlots', SLOT_ID), { ownerId: 'member-a' }));
  });

  it('대응 예약 없이 만드는 고아 슬롯은 거부된다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertFails(setDoc(doc(db, 'reservationSlots', '2030-01-01_10-00'), {
      reservationId: 'ghost',
      ownerId: 'member-b',
      dayKey: DAY_KEY,
      startsAt: Timestamp.fromDate(START),
      createdAt: serverTimestamp(),
    }));
  });

  it('예약과 슬롯을 한 배치로 만들면 성공한다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'reservations', 'r-batch'), reservationCreatePayload('member-b', { slotIds: ['2030-01-01_11-00'] }));
    batch.set(doc(db, 'reservationSlots', '2030-01-01_11-00'), {
      reservationId: 'r-batch',
      ownerId: 'member-b',
      dayKey: DAY_KEY,
      startsAt: Timestamp.fromDate(START),
      createdAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
  });

  it('본인 슬롯은 예약 삭제와 함께 지울 수 있다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    const batch = writeBatch(db);
    batch.delete(doc(db, 'reservations', 'owned'));
    batch.delete(doc(db, 'reservationSlots', SLOT_ID));
    await assertSucceeds(batch.commit());
  });
});
