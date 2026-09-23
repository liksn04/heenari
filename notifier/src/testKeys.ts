// 테스트 전용: 실제 RSA 키를 만들어 PEM으로 내보낸다(저장소에 키를 두지 않기 위해 매번 생성).
export async function generateTestAccount() {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer);
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  const body = btoa(binary).match(/.{1,64}/g)!.join('\n');
  return {
    account: { client_email: 'notifier@heenari-test.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n` },
    publicKey: pair.publicKey,
  };
}
