import type { Collection, JamDoc, PushJob } from './logic';
import type { FetchLike } from './google';

// Firestore REST v1. Worker는 서비스 계정(IAM)으로 접근하므로 Rules를 거치지 않는다.

type Value =
  | { stringValue: string }
  | { timestampValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Record<string, Value> } };

interface RestDocument {
  name: string;
  fields?: Record<string, Value>;
}

export function decodeValue(value: Value | undefined): unknown {
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return new Date(value.timestampValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, inner]) => [key, decodeValue(inner)]));
  }
  return undefined;
}

function decodeFields(doc: RestDocument): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc.fields ?? {}).map(([key, value]) => [key, decodeValue(value)]));
}

function lastSegment(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1);
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function toJamDoc(collection: Collection, doc: RestDocument): JamDoc | null {
  const data = decodeFields(doc);
  if (!(data.startAt instanceof Date)) return null;
  const authorId = collection === 'reservations' ? text(data.ownerId) : text(data.createdBy);
  if (!authorId) return null;
  return {
    collection,
    id: lastSegment(doc.name),
    title: text(data.title) ?? '합주',
    authorId,
    authorName: collection === 'reservations' ? text(data.ownerName) : null,
    startAt: data.startAt,
    tag: text(data.tag),
    participantIds: strings(data.participantIds),
    location: text(data.location),
    dayKey: text(data.dayKey),
  };
}

export function toPushJob(doc: RestDocument): PushJob {
  const data = decodeFields(doc);
  return {
    id: lastSegment(doc.name),
    kind: text(data.kind) ?? '',
    collection: text(data.collection) ?? '',
    docId: text(data.docId) ?? '',
    targetIds: strings(data.targetIds),
    createdBy: text(data.createdBy) ?? '',
  };
}

export interface Device {
  id: string;
  token: string;
}

export interface Store {
  listPushJobs(limit: number): Promise<PushJob[]>;
  deletePushJob(id: string): Promise<void>;
  getJamDoc(collection: Collection, id: string): Promise<JamDoc | null>;
  jamsStartingBetween(collection: Collection, from: Date, to: Date): Promise<JamDoc[]>;
  memberName(uid: string): Promise<string | null>;
  listDevices(uid: string): Promise<Device[]>;
  deleteDevice(uid: string, deviceId: string): Promise<void>;
  // 중복 발송 방지: 처음 기록하면 true, 이미 있으면 false.
  claimLog(key: string, now: Date): Promise<boolean>;
}

export function createStore(projectId: string, token: () => Promise<string>, fetcher: FetchLike): Store {
  const root = `projects/${projectId}/databases/(default)/documents`;
  const base = `https://firestore.googleapis.com/v1/${root}`;

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetcher(`${base}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    return response;
  }

  async function ok(response: Response, what: string): Promise<Response> {
    if (!response.ok) throw new Error(`Firestore ${what} 실패: ${response.status}`);
    return response;
  }

  async function runQuery(structuredQuery: unknown): Promise<RestDocument[]> {
    const response = await ok(await call(':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery }) }), 'runQuery');
    const rows = (await response.json()) as { document?: RestDocument }[];
    return rows.flatMap((row) => (row.document ? [row.document] : []));
  }

  return {
    async listPushJobs(limit) {
      const docs = await runQuery({ from: [{ collectionId: 'pushJobs' }], limit });
      return docs.map(toPushJob);
    },
    async deletePushJob(id) {
      await ok(await call(`/pushJobs/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'delete pushJob');
    },
    async getJamDoc(collection, id) {
      const response = await call(`/${collection}/${encodeURIComponent(id)}`);
      if (response.status === 404) return null;
      return toJamDoc(collection, (await (await ok(response, 'get')).json()) as RestDocument);
    },
    async jamsStartingBetween(collection, from, to) {
      const docs = await runQuery({
        from: [{ collectionId: collection }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'startAt' }, op: 'GREATER_THAN', value: { timestampValue: from.toISOString() } } },
              { fieldFilter: { field: { fieldPath: 'startAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: to.toISOString() } } },
            ],
          },
        },
        orderBy: [{ field: { fieldPath: 'startAt' }, direction: 'ASCENDING' }],
        limit: 100,
      });
      return docs.map((doc) => toJamDoc(collection, doc)).filter((doc): doc is JamDoc => doc !== null);
    },
    async memberName(uid) {
      const response = await call(`/members/${encodeURIComponent(uid)}`);
      if (response.status === 404) return null;
      return text(decodeFields((await (await ok(response, 'get member')).json()) as RestDocument).name);
    },
    async listDevices(uid) {
      const response = await call(`/members/${encodeURIComponent(uid)}/devices?pageSize=20`);
      if (response.status === 404) return [];
      const body = (await (await ok(response, 'list devices')).json()) as { documents?: RestDocument[] };
      return (body.documents ?? []).flatMap((doc) => {
        const token = text(decodeFields(doc).token);
        return token ? [{ id: lastSegment(doc.name), token }] : [];
      });
    },
    async deleteDevice(uid, deviceId) {
      await ok(await call(`/members/${encodeURIComponent(uid)}/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }), 'delete device');
    },
    async claimLog(key, now) {
      const response = await call(`/pushLog?documentId=${encodeURIComponent(key)}`, {
        method: 'POST',
        body: JSON.stringify({ fields: { sentAt: { timestampValue: now.toISOString() } } }),
      });
      if (response.status === 409) return false;
      await ok(response, 'claim log');
      return true;
    },
  };
}
