# HEENARI-FB-04 — PWA·합주 초대·알림

상태: 코드 완료, 운영 설정 대기 (`docs/heenari-fb-04-closeout.md`, `notifier/README.md`)
선행 게이트: HEENARI-FB-03 일정과 통합 홈(완료·배포, `docs/heenari-fb-03-closeout.md`)
Source of truth: `docs/heenari-lite-capability.md`

## CAPABILITY

회원은 희나리를 휴대폰 홈 화면에 앱처럼 설치한다. 합주를 잡을 때 함께할 회원을 골라
초대하면, 초대받은 회원은 곧바로 참여자가 되고 푸시 알림을 받는다. 합주 시작 1시간 전에는
예약한 회원과 참여자 모두에게 알림이 간다.

## 사용자 결정 (2026-09-23)

- 알림 발송 서버: **Cloudflare Workers**(무료, 1분 cron). Firebase는 Spark 요금제 유지.
- 합주 알림 시각: **시작 1시간 전 고정**.
- 초대: **수락 절차 없음**. 초대 즉시 참여자. 빠지기는 두지 않는다(2026-09-23 사용자 요청으로 제거) —
  참여자 명단은 합주를 잡은 사람만 바꾼다.
- 이 게이트는 capability 문서의 비목표였던 "푸시 알림"과 "PWA 설치"를 사용자 요청으로 범위에 넣는다.
  이메일·문자 알림, 채팅, 오프라인 예약은 계속 비목표다.

## GATE BOUNDARY

```text
Gate: HEENARI-FB-04 PWA·합주 초대·알림
Goal: 설치형 PWA, 합주 초대(참여자), 초대 즉시 푸시와 합주 1시간 전 푸시
Non-goals: 수락·거절 흐름, 알림 시각 선택, 일반 일정 알림, 이메일·문자, 오프라인 예약, 채팅
Allowed surface: public/(manifest·아이콘·sw.js), index.html, src/heenari/(members·push·초대 UI),
  예약·일정 저장 경로의 참여자·알림 작업 기록, firestore.rules, indexes, tests,
  firebase.json hosting headers, notifier/(Cloudflare Worker), docs
Forbidden surface: Auth provider·persistence, 결제·요금제 변경, 서비스 계정 키를 저장소나 클라이언트에 두는 것
Validation: lint, test, coverage 80%+, Rules 에뮬레이터, build, bundle, 모바일 QA, 설치 가능성 확인
Closeout: docs/heenari-fb-04-closeout.md
```

## 아키텍처

```text
[앱] 예약/일정 저장 ─ 같은 트랜잭션 ─▶ pushJobs/{id} (초대 대상)
[앱] 알림 켜기 ─ FCM 토큰 ─▶ members/{uid}/devices/{deviceId}
[Worker, 1분 cron] ─ Google OAuth(서비스 계정) ─▶ Firestore REST
   1) pushJobs 처리: 대상이 실제 참여자인지 다시 확인 → FCM 발송 → 작업 삭제
   2) 합주 리마인더: 1시간 안에 시작하는 jam 태그 예약·일정 → 예약자+참여자 → FCM
      pushLog/{key}로 중복 발송 방지(시간이 바뀌면 새 키)
[서비스 워커] push 수신 → 알림 표시, 알림 클릭 → 앱의 일정 화면 열기
```

- 푸시는 FCM(Web Push) 데이터 메시지로 보내고, 알림 표시는 우리 서비스 워커가 한다.
- iOS는 홈 화면에 설치한 PWA에서만 푸시를 받는다(iOS 16.4+).
- Worker는 IAM 권한으로 Rules를 우회하므로 모든 입력을 다시 검증한다.
- 서비스 계정 키는 `wrangler secret`으로만 넣는다. 저장소·클라이언트·로그에 두지 않는다.

## DATA CONTRACT

### `members/{uid}` — 회원 명부·프로필

```ts
interface Member {
  name: string;          // 1..60 (편집 화면은 1..20, 실명 권장)
  bio?: string | null;   // 한줄소개 null 또는 1..60
  updatedAt: Timestamp;
}
```

처음 로그인할 때만 Google 이름으로 만들고, 이후에는 회원이 고친 프로필을 덮어쓰지 않는다.
내 정보 → 프로필 편집에서 이름·한줄소개를 고친다(담당 세션은 사용자 요청으로 두지 않는다). 같은 이름의 회원이 있으면
"동명이인이 맞아요" 확인을 받아야 저장된다(예전 Roomin 규칙 참고). 프로필 사진은 두지 않는다
(파일 업로드 비목표). 앱의 표시 이름·새 예약의 `ownerName`·초대 알림은 프로필 이름을 쓴다.
이메일은 저장하지 않는다. 검증 회원은 모두 읽고, 쓰기는 본인 문서만.

### `members/{uid}/devices/{deviceId}` — 푸시 토큰

```ts
interface Device { token: string /* 1..4096 */; updatedAt: Timestamp }
```

`deviceId`는 토큰의 SHA-256 앞 40자. 본인만 읽고 쓰고 지운다. Worker는 만료 토큰을 지운다.

### 예약·일정의 `participantIds`

- `reservations`·`events`에 선택 필드 `participantIds: string[]`(0..20, 중복 없음, 작성자 제외).
- 작성자만 바꾼다. 참여자·다른 회원은 참여자 목록을 바꿀 수 없다(빠지기 없음).
- 초대 UI는 태그가 합주일 때만 보인다.

### `pushJobs/{jobId}` — 초대 알림 작업

```ts
interface PushJob {
  kind: 'invite';
  collection: 'reservations' | 'events';
  docId: string;
  targetIds: string[];   // 1..20, 새로 초대된 회원만
  createdBy: string;     // 작성자 uid
  createdAt: Timestamp;
}
```

생성만 가능. 대상 문서가 같은 쓰기 이후 존재하고, 작성자가 본인이며, `targetIds`가 모두 그
문서의 `participantIds` 안에 있어야 한다(`getAfter`). 읽기·수정·삭제는 클라이언트 불가.

### `pushLog/{key}` — Worker 전용 중복 방지 기록. 클라이언트 접근 불가(기본 거부).

## 알림 문구

- 초대: `합주 초대` / `{작성자}님이 {M월 D일 HH:mm} 합주에 초대했어요. {제목}`
- 리마인더: `합주 1시간 전` / `{HH:mm} {제목} · {장소}` (1시간 안쪽으로 늦게 잡힌 합주는 남은 분을 표시)

## PWA

- `manifest.webmanifest`: 이름 희나리, standalone, 시작 `/`, 테마 #E60000, 배경 #F8F4E8,
  아이콘 192·512·maskable 512(원본 로고를 정사각형으로 자르고 크림 배경에 배치, 재해석 없음).
- `sw.js`: `/__/`(Firebase Auth 핸들러)와 외부 도메인·비 GET은 건드리지 않는다. 화면 이동은
  네트워크 우선 후 캐시 폴백, `/assets/*`는 캐시 우선. 오프라인에서 예약은 계속 막는다.
- Hosting: `sw.js`는 `no-cache`, manifest는 `application/manifest+json`.
- 내 정보 화면에 `앱 설치`(지원 브라우저)·iOS 안내, `합주 알림 받기` 스위치.

## REQUIRED TESTS

- Rules: members 본인 쓰기만·스키마, devices 본인만, pushJobs 생성 조건(작성자·참여자 포함·getAfter)과
  읽기 금지, participantIds 스키마·작성자 제외·20명 제한, 참여자·비참여자의 참여자 목록 변경 거부,
  기존 데이터 호환
- 순수 로직: 새 초대 대상 계산, 리마인더 대상·키·문구, FCM 메시지 형태, 토큰 ID
- UI: 합주일 때만 초대 선택(이름 검색), 초대됨·함께 표시, 알림 켜기 상태(미지원·iOS 미설치·거부·완료)
- Worker: 작업 검증(가짜 대상 차단), 리마인더 중복 방지, 만료 토큰 정리 — Firestore/FCM은 가짜로

## DEFINITION OF DONE

- 설치 가능한 PWA(manifest·SW 등록 확인), Auth 리디렉션이 SW에 가로채이지 않음
- 합주 초대·참여 표시 동작, Rules 테스트로 권한 재현
- Worker 로직 테스트 통과, 배포·설정 절차 문서화(실제 배포는 사용자 계정으로)
- 전체 검증 통과, `docs/heenari-fb-04-closeout.md` 작성
