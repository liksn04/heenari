import { describe, expect, it, vi } from 'vitest';
import { buildFcmBody, createMessenger } from './fcm';

const message = { title: '합주 초대', body: '본문', url: '/schedule', tag: 'invite-r1' };

describe('FCM', () => {
  it('데이터 메시지와 긴급·TTL 헤더로 보낸다', async () => {
    expect(buildFcmBody('t1', message)).toEqual({
      message: { token: 't1', data: message, webpush: { headers: { Urgency: 'high', TTL: '3600' } } },
    });
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    const messenger = createMessenger('p', async () => 'tok', fetcher);
    expect(await messenger.send('t1', message)).toBe('sent');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/p/messages:send');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('만료·잘못된 토큰과 일시 오류를 구분한다', async () => {
    const respond = (status: number, body: unknown = {}) => createMessenger('p', async () => 'tok', vi.fn(async () => new Response(JSON.stringify(body), { status })));
    expect(await respond(404).send('t', message)).toBe('invalid-token');
    expect(await respond(400, { error: { details: [{ errorCode: 'UNREGISTERED' }] } }).send('t', message)).toBe('invalid-token');
    expect(await respond(400, { error: { details: [{ errorCode: 'INVALID_ARGUMENT' }] } }).send('t', message)).toBe('invalid-token');
    expect(await respond(400, { error: {} }).send('t', message)).toBe('failed');
    expect(await respond(503).send('t', message)).toBe('failed');
    const broken = createMessenger('p', async () => 'tok', vi.fn(async () => new Response('not json', { status: 400 })));
    expect(await broken.send('t', message)).toBe('failed');
  });
});
