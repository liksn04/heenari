import { accessToken, type ServiceAccount } from './google';
import { createStore } from './firestore';
import { createMessenger } from './fcm';
import { runOnce } from './run';

// 희나리 알림 Worker: 1분마다 합주 초대 알림과 합주 1시간 전 알림을 보낸다.

export interface Env {
  FIREBASE_PROJECT_ID: string;
  GOOGLE_SERVICE_ACCOUNT: string; // wrangler secret put GOOGLE_SERVICE_ACCOUNT (JSON 전체)
}

interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export async function runWithEnv(env: Env, now: Date = new Date(), fetcher: typeof fetch = fetch) {
  const account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT) as ServiceAccount;
  const token = () => accessToken(account, fetcher, now);
  const store = createStore(env.FIREBASE_PROJECT_ID, token, fetcher);
  const messenger = createMessenger(env.FIREBASE_PROJECT_ID, token, fetcher);
  const summary = await runOnce(store, messenger, now);
  if (summary.jobs || summary.invitesSent || summary.remindersSent || summary.failures) {
    console.log('heenari-notifier', JSON.stringify(summary));
  }
  return summary;
}

export default {
  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContextLike) {
    ctx.waitUntil(runWithEnv(env));
  },
  // 동작 확인용. 알림 발송은 cron에서만 한다.
  async fetch() {
    return new Response('heenari notifier', { status: 200 });
  },
};
