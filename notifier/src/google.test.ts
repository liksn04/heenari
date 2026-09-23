import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accessToken, resetTokenCacheForTest, SCOPES, signJwt } from './google';
import { generateTestAccount } from './testKeys';

function decodePart(part: string) {
  return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
}

beforeEach(() => resetTokenCacheForTest());

describe('signJwt', () => {
  it('서비스 계정 키로 서명한 RS256 JWT를 만들고 공개키로 검증된다', async () => {
    const { account, publicKey } = await generateTestAccount();
    const jwt = await signJwt(account, 1_900_000_000);
    const [header, claims, signature] = jwt.split('.');
    expect(decodePart(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decodePart(claims)).toEqual({
      iss: account.client_email,
      scope: SCOPES.join(' '),
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_900_000_000,
      exp: 1_900_003_600,
    });
    const sig = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, sig, new TextEncoder().encode(`${header}.${claims}`));
    expect(valid).toBe(true);
  });
});

describe('accessToken', () => {
  it('토큰을 받아 만료 1분 전까지 재사용한다', async () => {
    const { account } = await generateTestAccount();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: 'ya29.t', expires_in: 3600 }), { status: 200 }));
    const now = new Date('2030-01-01T00:00:00Z');
    expect(await accessToken(account, fetcher, now)).toBe('ya29.t');
    expect(await accessToken(account, fetcher, new Date(now.getTime() + 58 * 60_000))).toBe('ya29.t');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await accessToken(account, fetcher, new Date(now.getTime() + 59 * 60_000 + 1));
    expect(fetcher).toHaveBeenCalledTimes(2);
    const init = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[0]).toBe('https://oauth2.googleapis.com/token');
    expect(String(init[1].body)).toMatch(/^grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=/);
  });

  it('발급 실패를 오류로 알린다', async () => {
    const { account } = await generateTestAccount();
    const fetcher = vi.fn(async () => new Response('denied', { status: 403 }));
    await expect(accessToken(account, fetcher)).rejects.toThrow('Google 토큰 발급 실패: 403');
  });
});
