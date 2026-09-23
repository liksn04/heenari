// 서비스 계정으로 Google OAuth 액세스 토큰을 받는다(WebCrypto RS256 JWT). 키는 Worker 비밀값에서만 읽는다.

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export const SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/firebase.messaging',
];

const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

function base64Url(bytes: Uint8Array | string): string {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function signJwt(account: ServiceAccount, nowSeconds: number): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: SCOPES.join(' '),
    aud: account.token_uri ?? DEFAULT_TOKEN_URI,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let cached: { token: string; expiresAt: number } | null = null;

export function resetTokenCacheForTest() {
  cached = null;
}

// 한 isolate 안에서는 만료 1분 전까지 토큰을 재사용한다.
export async function accessToken(account: ServiceAccount, fetcher: FetchLike, now: Date = new Date()): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > now.getTime()) return cached.token;
  const assertion = await signJwt(account, Math.floor(now.getTime() / 1000));
  const response = await fetcher(account.token_uri ?? DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
  });
  if (!response.ok) throw new Error(`Google 토큰 발급 실패: ${response.status}`);
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, expiresAt: now.getTime() + body.expires_in * 1000 };
  return body.access_token;
}
