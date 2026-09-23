# HEENARI-FB-05 — 홈 다음 합주

상태: 완료·배포(2026-09-24, PR #7) (`docs/heenari-fb-05-closeout.md`)
선행 게이트: HEENARI-FB-04 PWA·합주 초대·알림(완료·배포, `docs/heenari-fb-04-closeout.md`)
Source of truth: `docs/heenari-lite-capability.md`

## CAPABILITY

홈에서 가장 강조되는 빨간 카드는 동아리 전체의 다음 합주를 보여준다.

> **2026-09-24 범위 축소:** 처음에는 운영진 전용 동아리 공지(`notices`, 홈 최신 3개 + `/notices`)도
> 함께 만들어 배포했으나(PR #7), 같은 날 사용자 요청으로 공지 기능을 통째로 삭제했다. `notices`
> 컬렉션은 Rules 기본 거부로 돌아갔고, 운영 DB에는 공지 문서가 없었다(삭제 전 확인, 0건).

## 사용자 결정 (2026-09-24)

- 빨간 카드: **동아리 전체의 다음 합주**(내 합주만이 아니라 누가 잡았든). 동아리방 합주 예약과
  합주 태그 일정을 가리지 않고, 끝나지 않은(진행 중 포함) 가장 이른 것 하나.
- 동아리 공지: **두지 않는다**(한 번 만들었다가 삭제).

## GATE BOUNDARY

```text
Gate: HEENARI-FB-05 홈 다음 합주
Goal: 홈 빨간 카드 = 동아리 전체의 다음 합주
Non-goals: 동아리 공지, 공지 알림, 댓글
Allowed surface: src/heenari/(home·pages·일정 조회), src/heenari.css, firestore.rules,
  firestore.indexes.json, tests, docs
Forbidden surface: Auth provider·persistence, 알림 Worker, 결제·요금제 변경
Validation: lint, test, coverage 80%+, Rules 에뮬레이터, build, bundle, 모바일 QA(360·390px)
Closeout: docs/heenari-fb-05-closeout.md
```

## QUERY CONTRACT

- 다음 합주(예약): `tag == 'jam'`, `startAt >= now − 1시간`(진행 중 합주 포함), `startAt asc`, `limit 5`
  → 복합 인덱스 `reservations(tag, startAt)`.
- 다음 합주(일정): `tag == 'jam'`, `startAt >= now − 72시간`(진행 중 여러 날 일정 포함), `startAt asc`,
  `limit 20` → 복합 인덱스 `events(tag, startAt)`.
- 두 결과를 합쳐 끝나지 않은 가장 이른 합주 하나를 고른다(`nextJam`, `src/heenari/schedule/timeline.ts`).
