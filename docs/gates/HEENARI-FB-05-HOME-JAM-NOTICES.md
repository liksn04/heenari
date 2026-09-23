# HEENARI-FB-05 — 홈 다음 합주·동아리 공지

상태: 코드 완료, Rules·인덱스 배포와 머지 대기 (`docs/heenari-fb-05-closeout.md`)
선행 게이트: HEENARI-FB-04 PWA·합주 초대·알림(완료·배포, `docs/heenari-fb-04-closeout.md`)
Source of truth: `docs/heenari-lite-capability.md`

## CAPABILITY

홈에서 가장 강조되는 빨간 카드는 동아리 전체의 다음 합주를 보여준다. 동아리 공지는 따로 칸을 두고
운영진만 올린다. 회원은 홈에서 최신 공지 3개를 보고, 전체 보기로 모든 공지를 읽는다.

## 사용자 결정 (2026-09-24)

- 빨간 카드: **동아리 전체의 다음 합주**(내 합주만이 아니라 누가 잡았든). 동아리방 합주 예약과
  합주 태그 일정을 가리지 않고, 끝나지 않은(진행 중 포함) 가장 이른 것 하나.
- 공지 작성: **운영진(`admins/{uid}`)만** 작성·수정·삭제. 회원은 읽기만.
- 공지 표시: **홈 최신 3개 + 전체 보기(`/notices`)**. 누르면 본문이 열린다. 고정 공지는 두지 않는다.
- 공지는 푸시 알림을 보내지 않는다(알림은 FB-04의 합주 초대·1시간 전만). 댓글도 두지 않는다.

## GATE BOUNDARY

```text
Gate: HEENARI-FB-05 홈 다음 합주·동아리 공지
Goal: 홈 빨간 카드 = 동아리 전체의 다음 합주, 운영진 전용 공지(홈 3개 + 전체 보기)
Non-goals: 공지 알림, 고정 공지, 댓글·읽음 표시, 첨부 파일, 회원 공지 작성
Allowed surface: src/heenari/(home·notices·pages·App 라우트·일정 조회), src/heenari.css,
  firestore.rules, firestore.indexes.json, tests, docs
Forbidden surface: Auth provider·persistence, 알림 Worker, 결제·요금제 변경
Validation: lint, test, coverage 80%+, Rules 에뮬레이터, build, bundle, 모바일 QA(360·390px)
Closeout: docs/heenari-fb-05-closeout.md
```

## DATA CONTRACT

### `notices/{noticeId}` — 동아리 공지

```ts
interface Notice {
  title: string;       // 1..60 (앞뒤 공백 제거)
  body: string;        // 1..1000, 줄바꿈 유지
  authorId: string;    // 작성한 운영진 uid, 불변
  authorName: string;  // 작성 당시 이름 스냅샷 1..60, 불변
  createdAt: Timestamp; // 서버 시각, 불변
  updatedAt: Timestamp; // 서버 시각
}
```

Rules:

- 읽기: 검증된 Google 회원.
- 생성: `isAdmin()`이고 `authorId == auth.uid`, 두 시각 모두 `request.time`.
- 수정: `isAdmin()`(다른 운영진 공지도 가능). `authorId`·`authorName`·`createdAt`은 그대로,
  `updatedAt == request.time`.
- 삭제: `isAdmin()`.

## QUERY CONTRACT

- 공지: `orderBy(createdAt desc)`, 홈 `limit 3`, 전체 보기 `limit 50` (단일 필드 인덱스).
- 다음 합주(예약): `tag == 'jam'`, `startAt >= now − 1시간`(진행 중 합주 포함), `startAt asc`, `limit 5`
  → 복합 인덱스 `reservations(tag, startAt)`.
- 다음 합주(일정): `tag == 'jam'`, `startAt >= now − 72시간`(진행 중 여러 날 일정 포함), `startAt asc`,
  `limit 20` → 복합 인덱스 `events(tag, startAt)`.
- 두 결과를 합쳐 끝나지 않은 가장 이른 합주 하나를 고른다(`nextJam`, `src/heenari/schedule/timeline.ts`).

## 배포 순서

1. 최신 main과 같은 폴더에서 `firebase deploy --only firestore` (Rules + 인덱스 2종).
2. 인덱스가 만들어진 뒤 PR 머지 → Hosting 자동 배포. 인덱스가 없으면 빨간 카드가
   "합주를 불러오지 못했어요"로 보인다.
