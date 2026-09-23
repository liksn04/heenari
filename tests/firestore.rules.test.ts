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

const EVENT_START = new Date(Date.UTC(2030, 0, 2, 10, 0, 0)); // 2030-01-02 19:00 KST
const EVENT_END = new Date(EVENT_START.getTime() + 2 * 60 * 60 * 1000);
const ALL_DAY_START = new Date(Date.UTC(2030, 0, 2, 15, 0, 0)); // 2030-01-03 00:00 KST
const HOUR_MS = 60 * 60 * 1000;

function eventCreatePayload(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    title: '정기 모임',
    description: null,
    location: '동아리방',
    startAt: Timestamp.fromDate(EVENT_START),
    endAt: Timestamp.fromDate(EVENT_END),
    allDay: false,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

function seededEvent(uid: string) {
  return {
    ...eventCreatePayload(uid),
    createdAt: Timestamp.fromDate(new Date(Date.UTC(2029, 0, 1))),
    updatedAt: Timestamp.fromDate(new Date(Date.UTC(2029, 0, 1))),
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
    await setDoc(doc(db, 'admins', 'admin-x'), { name: '운영진' });
    await setDoc(doc(db, 'events', 'event-1'), seededEvent('admin-x'));
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

  it('스키마 없는 events 쓰기와 모든 settings 쓰기는 거부된다', async () => {
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
      slotIds: Array.from({ length: 31 }, (_, i) => `${DAY_KEY}_slot-${i}`),
      endAt: Timestamp.fromDate(new Date(START.getTime() + 31 * 30 * 60 * 1000)),
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

describe('admins 규칙', () => {
  it('본인 admins 문서는 읽을 수 있지만 타인 문서는 읽을 수 없다', async () => {
    const admin = testEnv.authenticatedContext('admin-x', googleUser('admin-x')).firestore();
    const member = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertSucceeds(getDoc(doc(admin, 'admins', 'admin-x')));
    await assertSucceeds(getDoc(doc(member, 'admins', 'member-a')));
    await assertFails(getDoc(doc(member, 'admins', 'admin-x')));
  });

  it('회원은 스스로 admins 문서를 만들어 승격할 수 없다', async () => {
    const member = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertFails(setDoc(doc(member, 'admins', 'member-a'), { name: '셀프 승격' }));
  });

  it('관리자도 admins 문서를 쓰거나 지울 수 없다', async () => {
    const admin = testEnv.authenticatedContext('admin-x', googleUser('admin-x')).firestore();
    await assertFails(setDoc(doc(admin, 'admins', 'member-a'), { name: '임명' }));
    await assertFails(deleteDoc(doc(admin, 'admins', 'admin-x')));
  });

  it('비로그인 사용자는 admins 문서를 읽을 수 없다', async () => {
    const guest = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(guest, 'admins', 'admin-x')));
  });
});

describe('events 읽기', () => {
  it('검증된 회원은 일정을 읽고, 비로그인·미검증 사용자는 읽을 수 없다', async () => {
    const member = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    const guest = testEnv.unauthenticatedContext().firestore();
    const unverified = testEnv.authenticatedContext('u', { email_verified: false, firebase: { sign_in_provider: 'google.com' } }).firestore();
    await assertSucceeds(getDoc(doc(member, 'events', 'event-1')));
    await assertFails(getDoc(doc(guest, 'events', 'event-1')));
    await assertFails(getDoc(doc(unverified, 'events', 'event-1')));
  });
});

describe('events 쓰기', () => {
  it('관리자는 유효한 시간 일정과 종일 일정을 만들 수 있다', async () => {
    const admin = testEnv.authenticatedContext('admin-x', googleUser('admin-x')).firestore();
    await assertSucceeds(setDoc(doc(admin, 'events', 'e-timed'), eventCreatePayload('admin-x')));
    await assertSucceeds(setDoc(doc(admin, 'events', 'e-open'), eventCreatePayload('admin-x', { endAt: null })));
    await assertSucceeds(setDoc(doc(admin, 'events', 'e-allday'), eventCreatePayload('admin-x', {
      startAt: Timestamp.fromDate(ALL_DAY_START),
      endAt: null,
      allDay: true,
    })));
  });

  it('일반 회원도 본인 명의의 유효한 일정을 만들 수 있다', async () => {
    const member = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertSucceeds(setDoc(doc(member, 'events', 'e-member'), eventCreatePayload('member-a')));
  });

  it('일반 회원은 남이 만든 일정을 수정·삭제할 수 없다', async () => {
    const member = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertFails(updateDoc(doc(member, 'events', 'event-1'), { title: '변경', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(member, 'events', 'event-1')));
  });

  it('일반 회원은 자기가 만든 일정을 수정·삭제할 수 있다', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'events', 'e-own'), seededEvent('member-a'));
    });
    const member = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertSucceeds(updateDoc(doc(member, 'events', 'e-own'), { title: '내 일정 변경', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(member, 'events', 'e-own'), { createdBy: 'member-b', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(member, 'events', 'e-own')));
  });

  it('관리자는 회원이 만든 일정도 수정·삭제할 수 있다', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'events', 'e-own'), seededEvent('member-a'));
    });
    const admin = testEnv.authenticatedContext('admin-x', googleUser('admin-x')).firestore();
    await assertSucceeds(updateDoc(doc(admin, 'events', 'e-own'), { title: '정리', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(doc(admin, 'events', 'e-own')));
  });

  it('createdBy를 다른 사용자로 위조하면 거부된다', async () => {
    const admin = testEnv.authenticatedContext('admin-x', googleUser('admin-x')).firestore();
    const member = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertFails(setDoc(doc(admin, 'events', 'e-forged'), eventCreatePayload('member-a')));
    await assertFails(setDoc(doc(member, 'events', 'e-forged2'), eventCreatePayload('admin-x')));
  });

  it('비로그인·미검증 사용자는 일정을 만들 수 없다', async () => {
    const guest = testEnv.unauthenticatedContext().firestore();
    const unverified = testEnv.authenticatedContext('u', { email_verified: false, firebase: { sign_in_provider: 'google.com' } }).firestore();
    await assertFails(setDoc(doc(guest, 'events', 'e-guest'), eventCreatePayload('guest')));
    await assertFails(setDoc(doc(unverified, 'events', 'e-unverified'), eventCreatePayload('u')));
  });

  it('관리자라도 스키마를 벗어난 일정은 거부된다', async () => {
    const admin = testEnv.authenticatedContext('admin-x', googleUser('admin-x')).firestore();
    const bad: Record<string, unknown>[] = [
      { role: 'admin' },
      { title: '' },
      { title: '가'.repeat(61) },
      { description: '가'.repeat(501) },
      { description: '' },
      { location: '가'.repeat(61) },
      { endAt: Timestamp.fromDate(EVENT_START) },
      { endAt: Timestamp.fromDate(new Date(EVENT_START.getTime() - HOUR_MS)) },
      { endAt: Timestamp.fromDate(new Date(EVENT_START.getTime() + 72 * HOUR_MS + 1000)) },
      { allDay: 'yes' },
      { allDay: true, endAt: null },
      { allDay: true, startAt: Timestamp.fromDate(ALL_DAY_START), endAt: Timestamp.fromDate(new Date(ALL_DAY_START.getTime() + HOUR_MS)) },
      { startAt: '2030-01-02' },
    ];
    for (const [index, overrides] of bad.entries()) {
      await assertFails(setDoc(doc(admin, 'events', `e-bad-${index}`), eventCreatePayload('admin-x', overrides)));
    }
  });

  it('72시간 이내의 여러 날 일정은 허용된다', async () => {
    const admin = testEnv.authenticatedContext('admin-x', googleUser('admin-x')).firestore();
    await assertSucceeds(setDoc(doc(admin, 'events', 'e-mt'), eventCreatePayload('admin-x', {
      endAt: Timestamp.fromDate(new Date(EVENT_START.getTime() + 72 * HOUR_MS)),
    })));
  });

  it('관리자는 일정을 수정할 수 있지만 createdBy·createdAt은 바꿀 수 없다', async () => {
    const admin = testEnv.authenticatedContext('admin-x', googleUser('admin-x')).firestore();
    await assertSucceeds(updateDoc(doc(admin, 'events', 'event-1'), { title: '임시 총회', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(admin, 'events', 'event-1'), { createdBy: 'member-a', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(admin, 'events', 'event-1'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(admin, 'events', 'event-1'), { title: '타임스탬프 누락' }));
  });

  it('다른 관리자가 만든 일정도 관리자는 수정할 수 있다', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'admins', 'admin-y'), { name: '운영진2' });
    });
    const adminY = testEnv.authenticatedContext('admin-y', googleUser('admin-y')).firestore();
    await assertSucceeds(updateDoc(doc(adminY, 'events', 'event-1'), { location: null, updatedAt: serverTimestamp() }));
  });

  it('관리자는 일정을 삭제할 수 있다', async () => {
    const admin = testEnv.authenticatedContext('admin-x', googleUser('admin-x')).firestore();
    await assertSucceeds(deleteDoc(doc(admin, 'events', 'event-1')));
  });

  it('Google 외 provider로 로그인한 관리자 uid는 쓸 수 없다', async () => {
    const spoof = testEnv.authenticatedContext('admin-x', { email: 'a@example.com', email_verified: true, firebase: { sign_in_provider: 'password' } }).firestore();
    await assertFails(setDoc(doc(spoof, 'events', 'e-spoof'), eventCreatePayload('admin-x')));
  });
});

// 태그: jam(합주)·lesson(강습)·etc(기타). 합주만 최대 1시간(2슬롯), 나머지는 운영 시간(최대 30슬롯) 안에서 제한 없음.
function slotIdsFrom(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const minute = 9 * 60 + i * 30;
    return `${DAY_KEY}_${String(Math.floor(minute / 60)).padStart(2, '0')}-${String(minute % 60).padStart(2, '0')}`;
  });
}

function taggedReservation(uid: string, tag: string | undefined, slotCount: number) {
  const payload = reservationCreatePayload(uid, {
    slotIds: slotIdsFrom(slotCount),
    endAt: Timestamp.fromDate(new Date(START.getTime() + slotCount * 30 * 60 * 1000)),
  }) as Record<string, unknown>;
  if (tag !== undefined) payload.tag = tag;
  return payload;
}

describe('예약 태그', () => {
  it('합주는 1시간(2슬롯)까지 허용하고 1시간 30분은 거부한다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertSucceeds(setDoc(doc(db, 'reservations', 'jam-1h'), taggedReservation('member-b', 'jam', 2)));
    await assertFails(setDoc(doc(db, 'reservations', 'jam-90m'), taggedReservation('member-b', 'jam', 3)));
  });

  it('강습·기타·태그 없음은 4시간을 넘겨도 허용한다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertSucceeds(setDoc(doc(db, 'reservations', 'lesson-5h'), taggedReservation('member-b', 'lesson', 10)));
    await assertSucceeds(setDoc(doc(db, 'reservations', 'etc-5h'), taggedReservation('member-b', 'etc', 10)));
    await assertSucceeds(setDoc(doc(db, 'reservations', 'legacy-5h'), taggedReservation('member-b', undefined, 10)));
  });

  it('정해진 태그가 아니면 거부한다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertFails(setDoc(doc(db, 'reservations', 'bad-tag'), taggedReservation('member-b', '공연', 1)));
    await assertFails(setDoc(doc(db, 'reservations', 'bad-tag2'), taggedReservation('member-b', 'JAM', 1)));
  });

  it('09:00–24:00 하루 전체(30슬롯) 예약을 슬롯과 한 배치로 만들 수 있다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    const slotIds = slotIdsFrom(30);
    const batch = writeBatch(db);
    batch.set(doc(db, 'reservations', 'r-full-day'), taggedReservation('member-b', 'lesson', 30));
    for (const slotId of slotIds) {
      batch.set(doc(db, 'reservationSlots', slotId), {
        reservationId: 'r-full-day',
        ownerId: 'member-b',
        dayKey: DAY_KEY,
        startsAt: Timestamp.fromDate(START),
        createdAt: serverTimestamp(),
      });
    }
    // 시드 슬롯(09:00)과 겹치므로 먼저 비운다.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), 'reservationSlots', SLOT_ID));
    });
    await assertSucceeds(batch.commit());
  });

  it('기존 합주 예약을 3슬롯으로 늘리는 수정은 거부한다', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reservations', 'jam-owned'), {
        ...seededReservation('member-a', { slotIds: slotIdsFrom(2), endAt: Timestamp.fromDate(new Date(START.getTime() + 60 * 60 * 1000)) }),
        tag: 'jam',
      });
    });
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertFails(updateDoc(doc(db, 'reservations', 'jam-owned'), {
      slotIds: slotIdsFrom(3),
      endAt: Timestamp.fromDate(new Date(START.getTime() + 90 * 60 * 1000)),
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(doc(db, 'reservations', 'jam-owned'), { tag: 'etc', updatedAt: serverTimestamp() }));
  });
});

describe('일정 태그', () => {
  it('일정에도 정해진 태그만 붙일 수 있다', async () => {
    const member = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertSucceeds(setDoc(doc(member, 'events', 'e-tag'), eventCreatePayload('member-a', { tag: 'lesson' })));
    await assertFails(setDoc(doc(member, 'events', 'e-bad-tag'), eventCreatePayload('member-a', { tag: 'party' })));
  });
});

// ---- FB-04: 회원 명부·푸시 기기·참여자·초대 알림 작업 -------------------------

describe('members 회원 명부', () => {
  it('본인 명부 문서만 이름으로 만들고 고칠 수 있다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertSucceeds(setDoc(doc(db, 'members', 'member-a'), { name: '김희나', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'members', 'member-a'), { name: '김희나2', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'members', 'member-b'), { name: '사칭', updatedAt: serverTimestamp() }));
  });

  it('이메일 등 다른 필드, 빈 이름·긴 이름, 삭제는 거부한다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertFails(setDoc(doc(db, 'members', 'member-a'), { name: '김희나', email: 'a@example.com', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'members', 'member-a'), { name: '', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'members', 'member-a'), { name: '가'.repeat(61), updatedAt: serverTimestamp() }));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'members', 'member-a'), { name: '김희나', updatedAt: Timestamp.now() });
    });
    await assertFails(deleteDoc(doc(db, 'members', 'member-a')));
  });

  it('검증된 회원은 명부를 읽고, 비로그인은 읽을 수 없다', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'members', 'member-b'), { name: '이나리', updatedAt: Timestamp.now() });
    });
    const member = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertSucceeds(getDoc(doc(member, 'members', 'member-b')));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'members', 'member-b')));
  });
});

describe('members 프로필(이름·한줄소개)', () => {
  it('본인 프로필에 한줄소개를 저장하고 지울 수 있다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertSucceeds(setDoc(doc(db, 'members', 'member-a'), { name: '김희나', bio: '주말 합주 환영', updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(db, 'members', 'member-a'), { name: '김희나', bio: null, updatedAt: serverTimestamp() }));
  });

  it('담당 세션 같은 다른 필드, 긴 소개·빈 소개는 거부한다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    const base = { name: '김희나', updatedAt: serverTimestamp() };
    await assertFails(setDoc(doc(db, 'members', 'member-a'), { ...base, parts: ['vocal'] }));
    await assertFails(setDoc(doc(db, 'members', 'member-a'), { ...base, bio: '가'.repeat(61) }));
    await assertFails(setDoc(doc(db, 'members', 'member-a'), { ...base, bio: '' }));
  });

  it('남의 프로필은 바꿀 수 없다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertFails(setDoc(doc(db, 'members', 'member-b'), { name: '이나리', bio: null, updatedAt: serverTimestamp() }));
  });
});

describe('members/{uid}/devices 푸시 토큰', () => {
  it('본인 기기 토큰만 저장·조회·삭제한다', async () => {
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    const ref = doc(db, 'members', 'member-a', 'devices', 'd1');
    await assertSucceeds(setDoc(ref, { token: 'fcm-token', updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it('남의 토큰은 읽거나 쓸 수 없고, 다른 필드는 거부한다', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'members', 'member-b', 'devices', 'd1'), { token: 'secret', updatedAt: Timestamp.now() });
    });
    const db = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertFails(getDoc(doc(db, 'members', 'member-b', 'devices', 'd1')));
    await assertFails(setDoc(doc(db, 'members', 'member-b', 'devices', 'd2'), { token: 'x', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'members', 'member-a', 'devices', 'd3'), { token: 'x', platform: 'ios', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'members', 'member-a', 'devices', 'd4'), { token: '', updatedAt: serverTimestamp() }));
  });
});

describe('participantIds 합주 초대', () => {
  it('작성자는 참여자를 넣어 예약·일정을 만든다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertSucceeds(setDoc(doc(db, 'reservations', 'r-invite'), reservationCreatePayload('member-b', { participantIds: ['member-c', 'member-d'] })));
    await assertSucceeds(setDoc(doc(db, 'events', 'e-invite'), eventCreatePayload('member-b', { participantIds: ['member-c'] })));
  });

  it('작성자 자신·중복·20명 초과 참여자는 거부한다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertFails(setDoc(doc(db, 'reservations', 'r-self'), reservationCreatePayload('member-b', { participantIds: ['member-b'] })));
    await assertFails(setDoc(doc(db, 'reservations', 'r-dup'), reservationCreatePayload('member-b', { participantIds: ['member-c', 'member-c'] })));
    await assertFails(setDoc(doc(db, 'reservations', 'r-many'), reservationCreatePayload('member-b', {
      participantIds: Array.from({ length: 21 }, (_, i) => `m-${i}`),
    })));
    await assertFails(setDoc(doc(db, 'events', 'e-self'), eventCreatePayload('member-b', { participantIds: ['member-b'] })));
  });

  async function seedInvited() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'reservations', 'r-jam'), seededReservation('member-a', { participantIds: ['member-b', 'member-c'] }));
      await setDoc(doc(db, 'events', 'e-jam'), { ...seededEvent('member-a'), participantIds: ['member-b'] });
    });
  }

  it('참여자는 스스로 빠지거나 참여자 목록을 바꿀 수 없다(작성자만 바꾼다)', async () => {
    await seedInvited();
    const b = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertFails(updateDoc(doc(b, 'reservations', 'r-jam'), { participantIds: ['member-c'], updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(b, 'events', 'e-jam'), { participantIds: [], updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(b, 'reservations', 'r-jam'), { participantIds: ['member-b', 'member-c', 'member-x'], updatedAt: serverTimestamp() }));
  });

  it('참여자가 아닌 회원도 참여자 목록을 바꿀 수 없다', async () => {
    await seedInvited();
    const d = testEnv.authenticatedContext('member-d', googleUser('member-d')).firestore();
    await assertFails(updateDoc(doc(d, 'reservations', 'r-jam'), { participantIds: ['member-b', 'member-c', 'member-d'], updatedAt: serverTimestamp() }));
  });

  it('작성자는 참여자를 바꿀 수 있다', async () => {
    await seedInvited();
    const a = testEnv.authenticatedContext('member-a', googleUser('member-a')).firestore();
    await assertSucceeds(updateDoc(doc(a, 'reservations', 'r-jam'), { participantIds: ['member-d'], updatedAt: serverTimestamp() }));
  });
});

describe('pushJobs 초대 알림 작업', () => {
  function job(overrides: Record<string, unknown> = {}) {
    return {
      kind: 'invite',
      collection: 'reservations',
      docId: 'r-job',
      targetIds: ['member-c'],
      createdBy: 'member-b',
      createdAt: serverTimestamp(),
      ...overrides,
    };
  }

  it('예약과 같은 배치로 새 참여자에게 보낼 작업을 만든다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'reservations', 'r-job'), reservationCreatePayload('member-b', { participantIds: ['member-c', 'member-d'] }));
    batch.set(doc(db, 'pushJobs', 'j1'), job({ targetIds: ['member-c', 'member-d'] }));
    await assertSucceeds(batch.commit());
  });

  it('일정에 대한 작업도 만들 수 있다', async () => {
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'events', 'e-job'), eventCreatePayload('member-b', { participantIds: ['member-c'] }));
    batch.set(doc(db, 'pushJobs', 'j2'), job({ collection: 'events', docId: 'e-job' }));
    await assertSucceeds(batch.commit());
  });

  it('참여자가 아닌 대상, 남의 예약, 다른 작성자 명의, 이상한 종류는 거부한다', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'reservations', 'r-job'), seededReservation('member-b', { participantIds: ['member-c'] }));
      await setDoc(doc(context.firestore(), 'reservations', 'r-other'), seededReservation('member-a', { participantIds: ['member-c'] }));
    });
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertSucceeds(setDoc(doc(db, 'pushJobs', 'ok'), job()));
    await assertFails(setDoc(doc(db, 'pushJobs', 'not-participant'), job({ targetIds: ['member-x'] })));
    await assertFails(setDoc(doc(db, 'pushJobs', 'others-doc'), job({ docId: 'r-other' })));
    await assertFails(setDoc(doc(db, 'pushJobs', 'forged'), job({ createdBy: 'member-a' })));
    await assertFails(setDoc(doc(db, 'pushJobs', 'kind'), job({ kind: 'spam' })));
    await assertFails(setDoc(doc(db, 'pushJobs', 'coll'), job({ collection: 'admins' })));
    await assertFails(setDoc(doc(db, 'pushJobs', 'empty'), job({ targetIds: [] })));
    await assertFails(setDoc(doc(db, 'pushJobs', 'missing'), job({ docId: 'ghost' })));
  });

  it('작업은 읽거나 고치거나 지울 수 없고, pushLog는 접근할 수 없다', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'pushJobs', 'j'), { kind: 'invite' });
      await setDoc(doc(context.firestore(), 'pushLog', 'k'), { sentAt: Timestamp.now() });
    });
    const db = testEnv.authenticatedContext('member-b', googleUser('member-b')).firestore();
    await assertFails(getDoc(doc(db, 'pushJobs', 'j')));
    await assertFails(updateDoc(doc(db, 'pushJobs', 'j'), { kind: 'x' }));
    await assertFails(deleteDoc(doc(db, 'pushJobs', 'j')));
    await assertFails(getDoc(doc(db, 'pushLog', 'k')));
    await assertFails(setDoc(doc(db, 'pushLog', 'k2'), { sentAt: serverTimestamp() }));
  });
});
