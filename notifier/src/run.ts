import { inviteMessage, inviteTargets, REMINDER_WINDOW_MS, reminderFor, type PushMessage } from './logic';
import type { Store } from './firestore';
import type { Messenger } from './fcm';

export interface RunSummary {
  jobs: number;
  invitesSent: number;
  remindersSent: number;
  tokensRemoved: number;
  failures: number;
}

const JOB_BATCH = 50;

// 1분 cron 한 번의 일: 초대 작업 처리 → 합주 리마인더.
export async function runOnce(store: Store, messenger: Messenger, now: Date = new Date()): Promise<RunSummary> {
  const summary: RunSummary = { jobs: 0, invitesSent: 0, remindersSent: 0, tokensRemoved: 0, failures: 0 };

  async function sendToMember(uid: string, message: PushMessage): Promise<number> {
    let sent = 0;
    for (const device of await store.listDevices(uid)) {
      const result = await messenger.send(device.token, message);
      if (result === 'sent') sent += 1;
      else if (result === 'invalid-token') {
        await store.deleteDevice(uid, device.id);
        summary.tokensRemoved += 1;
      } else summary.failures += 1;
    }
    return sent;
  }

  for (const job of await store.listPushJobs(JOB_BATCH)) {
    summary.jobs += 1;
    try {
      const collection = job.collection === 'events' ? 'events' : 'reservations';
      const doc = job.collection === 'reservations' || job.collection === 'events' ? await store.getJamDoc(collection, job.docId) : null;
      const targets = inviteTargets(job, doc);
      if (doc && targets.length > 0) {
        const authorName = doc.authorName ?? (await store.memberName(doc.authorId)) ?? '회원';
        const message = inviteMessage(doc, authorName);
        for (const uid of targets) summary.invitesSent += await sendToMember(uid, message);
      }
    } catch {
      summary.failures += 1;
    } finally {
      // 잘못된 작업도 지워서 매분 다시 처리하지 않게 한다.
      await store.deletePushJob(job.id);
    }
  }

  const until = new Date(now.getTime() + REMINDER_WINDOW_MS);
  for (const collection of ['reservations', 'events'] as const) {
    for (const doc of await store.jamsStartingBetween(collection, now, until)) {
      const reminder = reminderFor(doc, now);
      if (!reminder) continue;
      if (!(await store.claimLog(reminder.key, now))) continue; // 이미 보냈다
      for (const uid of reminder.recipients) summary.remindersSent += await sendToMember(uid, reminder.message);
    }
  }

  return summary;
}
