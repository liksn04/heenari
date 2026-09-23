import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { runWithEnv } from './index';
import { resetTokenCacheForTest } from './google';
import { generateTestAccount } from './testKeys';

// 통합: 실제 서명 키 + 가짜 Google/Firestore/FCM 서버로 Worker 전체 흐름을 한 번 돌린다.

const BASE = 'https://firestore.googleapis.com/v1/projects/heenari-test/databases/(default)/documents';
const doc = (path: string, fields: Record<string, unknown>) => ({ name: `projects/heenari-test/databases/(default)/documents/${path}`, fields });

beforeEach(() => resetTokenCacheForTest());

describe('runWithEnv 통합', () => {
  it('토큰 발급 → 초대 작업 → 리마인더 → FCM 발송까지 이어진다', async () => {
    const { account } = await generateTestAccount();
    const now = new Date('2030-01-01T09:00:00.000Z');
    const fcmBodies: unknown[] = [];
    const log: string[] = [];
    const fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      log.push(`${method} ${url.replace(BASE, '')}`);
      if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'ya29.x', expires_in: 3600 }));
      if (url.startsWith('https://fcm.googleapis.com/')) {
        fcmBodies.push(JSON.parse(String(init.body)));
        return new Response('{}');
      }
      if (url === `${BASE}:runQuery`) {
        const collection = JSON.parse(String(init.body)).structuredQuery.from[0].collectionId;
        if (collection === 'pushJobs') {
          return new Response(JSON.stringify([{ document: doc('pushJobs/j1', {
            kind: { stringValue: 'invite' }, collection: { stringValue: 'reservations' }, docId: { stringValue: 'r1' },
            targetIds: { arrayValue: { values: [{ stringValue: 'b' }] } }, createdBy: { stringValue: 'owner' },
          }) }]));
        }
        if (collection === 'reservations') return new Response(JSON.stringify([{ document: doc('reservations/r1', jamFields) }]));
        return new Response(JSON.stringify([]));
      }
      if (url === `${BASE}/reservations/r1`) return new Response(JSON.stringify(doc('reservations/r1', jamFields)));
      if (url.includes('/devices')) {
        const uid = url.split('/members/')[1].split('/')[0];
        return new Response(JSON.stringify({ documents: [doc(`members/${uid}/devices/d-${uid}`, { token: { stringValue: `token-${uid}` } })] }));
      }
      if (method === 'DELETE' || url.includes('/pushLog?')) return new Response('{}');
      return new Response('', { status: 404 });
    });
    const jamFields = {
      title: { stringValue: '밴드 합주' }, ownerId: { stringValue: 'owner' }, ownerName: { stringValue: '김희나' },
      startAt: { timestampValue: '2030-01-01T10:00:00Z' }, tag: { stringValue: 'jam' }, dayKey: { stringValue: '2030-01-01' },
      participantIds: { arrayValue: { values: [{ stringValue: 'b' }] } },
    };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const summary = await runWithEnv(
      { FIREBASE_PROJECT_ID: 'heenari-test', GOOGLE_SERVICE_ACCOUNT: JSON.stringify(account) },
      now,
      fetcher as unknown as typeof fetch,
    );

    expect(summary).toEqual({ jobs: 1, invitesSent: 1, remindersSent: 2, tokensRemoved: 0, failures: 0 });
    expect(fcmBodies.map((body) => (body as { message: { token: string; data: { title: string } } }).message))
      .toEqual([
        expect.objectContaining({ token: 'token-b', data: expect.objectContaining({ title: '합주 초대' }) }),
        expect.objectContaining({ token: 'token-owner', data: expect.objectContaining({ title: '합주 1시간 전' }) }),
        expect.objectContaining({ token: 'token-b', data: expect.objectContaining({ title: '합주 1시간 전' }) }),
      ]);
    expect(log.filter((line) => line.includes('oauth2'))).toHaveLength(1); // 토큰은 한 번만 발급
    expect(log).toContain('DELETE /pushJobs/j1');
    expect(logSpy).toHaveBeenCalledWith('heenari-notifier', expect.stringContaining('"invitesSent":1'));
    logSpy.mockRestore();
  });
});

describe('worker 진입점', () => {
  it('fetch는 상태 확인만 하고, scheduled는 waitUntil로 실행을 맡긴다', async () => {
    const response = await worker.fetch();
    expect(await response.text()).toBe('heenari notifier');
    const waitUntil = vi.fn();
    await worker.scheduled({}, { FIREBASE_PROJECT_ID: 'p', GOOGLE_SERVICE_ACCOUNT: '{"client_email":"x","private_key":"bad"}' }, { waitUntil });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await (waitUntil.mock.calls[0][0] as Promise<unknown>).catch(() => undefined);
  });
});
