import type { PushMessage } from './logic';
import type { FetchLike } from './google';

// FCM HTTP v1. 데이터 메시지로 보내고 알림 표시는 앱의 서비스 워커가 한다.

export type SendResult = 'sent' | 'invalid-token' | 'failed';

export interface Messenger {
  send(token: string, message: PushMessage): Promise<SendResult>;
}

export function buildFcmBody(token: string, message: PushMessage) {
  return {
    message: {
      token,
      data: { title: message.title, body: message.body, url: message.url, tag: message.tag },
      webpush: { headers: { Urgency: 'high', TTL: '3600' } },
    },
  };
}

export function createMessenger(projectId: string, token: () => Promise<string>, fetcher: FetchLike): Messenger {
  const endpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  return {
    async send(deviceToken, message) {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
        body: JSON.stringify(buildFcmBody(deviceToken, message)),
      });
      if (response.ok) return 'sent';
      // 앱을 지웠거나 알림을 끈 기기의 토큰. 기기 문서를 지운다.
      if (response.status === 404) return 'invalid-token';
      if (response.status === 400) {
        const body = (await response.json().catch(() => ({}))) as { error?: { details?: { errorCode?: string }[] } };
        const codes = (body.error?.details ?? []).map((detail) => detail.errorCode);
        if (codes.includes('UNREGISTERED') || codes.includes('INVALID_ARGUMENT')) return 'invalid-token';
      }
      return 'failed';
    },
  };
}
