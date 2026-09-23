# HEENARI-FB-03 — 일정과 통합 홈

상태: 완료, 배포됨(Hosting·Firestore Rules, 2026-09-23) (`docs/heenari-fb-03-closeout.md`)
선행 게이트: HEENARI-FB-02 30분 예약 엔진(완료, `docs/heenari-fb-02-closeout.md`)
Source of truth: `docs/heenari-lite-capability.md`

## CAPABILITY

운영진(관리자)은 모바일에서 동아리 일정을 생성·수정·삭제하고, 모든 회원은
선택한 날짜의 공간 예약과 동아리 일정을 하나의 시간순 타임라인으로 확인한다.
홈은 다음 동아리 일정, 다음 내 예약, 오늘 일정 요약을 바로 보여준다.

## GATE BOUNDARY

```text
Gate: HEENARI-FB-03 일정과 통합 홈
Goal: 관리자 일정 CRUD와 회원용 통합 일정 화면, 홈의 다음 일정·오늘 요약을 구현한다.
Non-goals: 관리자의 타인 예약 정리, 관리자 지정 UI, 반복 일정, 참가 신청·출석, 알림, 여러 공간, PWA
Allowed surface: src/heenari/schedule/, src/heenari/admin/, 일정·홈·내 정보 화면,
  AuthContext의 관리자 역할 반영, firestore.rules, indexes, tests, heenari.css(기존 토큰 재사용)
Forbidden surface: Auth provider·persistence 변경, 회원 허용 목록, Hosting 설정,
  예약 엔진 트랜잭션·Rules 의미 변경, 기존 브랜드 토큰 재설계
Validation: unit/UI coverage 80%+, Rules tests, 모바일 QA, build, bundle, diff check
Closeout: docs/heenari-fb-03-closeout.md
Next handoff: HEENARI-FB-04 출시 준비(또는 관리자 예약 정리 게이트)
```

## 관리자 권한 결정 (2026-09-23 확정)

관리자 판정의 신뢰 소스는 **Firebase Console에서만 관리하는 `admins/{uid}` 문서**다.

- 문서가 존재하면 해당 uid는 관리자다. 필드 내용은 권한 판단에 쓰지 않는다.
- 클라이언트의 `admins` 쓰기는 전면 거부한다(자기 승격 차단).
- 회원은 자기 자신의 `admins/{uid}` 문서만 읽을 수 있다(역할 표시용).
- Rules는 `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`로 판정한다.
- Custom Claims는 Admin SDK와 서비스 계정 키가 필요하고 Cloud Functions가 비목표라
  채택하지 않았다. 관리자 지정·해제는 앱 UI 없이 Console에서 처리한다
  (제품 원칙 4: 운영 빈도가 낮은 기능은 Console로 처리).
- 화면의 관리자 버튼 표시는 UX일 뿐이며, 권한 경계는 Rules다.

### 관리자 지정 절차 (운영)

1. Firebase Console → Authentication → Users에서 대상 회원의 UID를 복사한다.
2. Firestore → `admins` 컬렉션 → 문서 ID에 UID를 넣고 문서를 만든다.
   권장 필드: `name`(string, 메모용), `createdAt`(timestamp).
3. 대상 회원이 앱을 새로고침하면 `운영진`으로 표시되고 일정 관리가 열린다.
4. 해제는 해당 문서를 삭제한다.

## 예약·일정 통합 (2026-09-23 사용자 요청, 이 문서의 다른 절보다 우선)

예약과 일정을 화면에서 구분하지 않는다. 일정 모달 하나로 모두 등록한다.

- 하단 내비게이션: `홈 / 일정 / 내 정보`. `/reserve`는 `/schedule`로 리디렉트한다.
- 일정 화면: `일정 추가` 버튼 하나, 필터 없음, 예약과 일정을 한 목록으로 표시
  (장소·작성자 텍스트, 본인 항목은 `내 일정`).
- 모달(`EntrySheet`): 제목(1–40) · 장소[`동아리방`(기본)/`다른 장소`+장소 이름] · 종일 ·
  시작·종료 · 설명(≤200). 저장 방식은 장소로 자동 판단한다(`entry.ts`의 `planEntry`).
  - **동아리방 + 시간 지정** → `reservations` + `reservationSlots`(FB-02 트랜잭션 그대로):
    09:00–24:00, 30분 경계, 하루 안, 오늘~60일. 종료 `00:00`은 24:00으로 본다.
    길이는 태그로 정한다: **합주 최대 1시간(2슬롯), 강습·기타 제한 없음(최대 30슬롯=하루 전체)**.
    시간은 30분 단위 드롭다운으로만 고른다(시작 09:00–23:30, 종료 시작+30분~태그 한도·24:00,
    길이 표시). 모바일 `<input type=time>`은 `step`을 무시해 1분 단위가 되므로 쓰지 않는다.
    종료 날짜 입력은 숨기고 같은 날로 고정한다. 다른 장소에서 바꿔 오면 가까운 30분 값으로 맞춘다.
  - **그 밖**(다른 장소, 종일, 여러 날) → `events`, 슬롯을 잠그지 않는다.
    동아리방 종일 일정은 `location: '동아리방'` 일정으로 저장한다.
- 태그: 모든 항목에 `합주(jam) / 강습(lesson) / 기타(etc)` 중 하나(기본 합주). 문서에는 코드값으로
  저장하고 목록에 텍스트 라벨로 표시한다. 태그가 없던 기존 문서는 허용하며 수정 시 기타로 채운다.
  다른 장소 일정의 태그는 라벨일 뿐 길이 제한이 없다(방을 잡지 않으므로).
  Rules: `validTag`로 값 검증, 예약은 `tag == 'jam'`이면 `slotIds.size() <= 2`, 전체 30슬롯 이하.
- 수정: 본인의 시작 전 예약(시간 변경은 `rescheduleReservation`), 본인이 만든 일정,
  관리자는 모든 일정. 예약↔일정 종류 변경은 막고 삭제 후 재등록을 안내한다.
- 권한 변경: `events` create는 모든 검증 회원(본인 명의), update/delete는 작성자 또는 관리자.
- 삭제된 FB-02 UI: `ReservationScheduler`, `ReservationCalendar`, `ReservationModal`,
  `ReservationForm`, `useDayReservations`, `daySlots`, `selection`(슬롯 그리드). 예약 엔진
  (`repository`, `policy`, `slots`)과 Rules는 그대로 쓴다.
- 아래 USER JOURNEYS의 필터·관리자 전용 추가·`회원은 읽기만` 서술은 이 절로 대체됐다.

## FIXED PRODUCT POLICY

- 시간대: `Asia/Seoul`
- 일정 제목: 1–60자, 설명: 없음 또는 최대 500자, 장소: 없음 또는 최대 60자
- 종일 일정: 시작은 해당 날짜 00:00(KST), 종료 없음, 하루짜리
- 시간 일정: 종료 없음 또는 시작 이후, 최대 72시간(2박 3일 MT 수용)
- 일정 시작 시각의 분 단위 정렬은 강제하지 않는다(예약만 30분 경계).
- 관리자는 지난 일정도 수정·삭제할 수 있다.
- 회원은 일정을 읽기만 한다.

## USER JOURNEYS

### 통합 일정 확인 (/schedule)

1. 진입 시 오늘을 선택한다. 월간 달력은 과거·미래 달 모두 이동할 수 있다.
2. 동아리 일정이 있는 날짜는 보조 표식과 함께 접근성 라벨 `일정 있음`을 붙인다.
3. `전체 / 예약 / 동아리 일정` 필터를 고른다.
4. 선택일 타임라인은 종일 일정을 먼저, 그 뒤 시작 시각 오름차순으로 보여준다.
5. 각 항목은 색상 외에 `예약` 또는 `동아리 일정` 텍스트를 표시한다.
6. 여러 날에 걸친 일정은 걸쳐 있는 모든 날짜에 표시한다.

### 관리자 일정 관리

1. 관리자에게만 `일정 추가` 버튼을 보인다.
2. 바텀시트에서 제목·종일 여부·시작·종료·장소·설명을 입력한다.
3. 관리자가 동아리 일정 항목을 누르면 같은 시트로 수정·삭제한다.
4. 삭제는 한 번 더 확인한다.
5. 커밋 성공 후에만 성공을 표시하고 타임라인을 다시 불러온다.
6. 오프라인이면 저장·삭제를 비활성화한다.

### 홈

- 다음 동아리 일정: 아직 끝나지 않은 가장 가까운 일정 한 건
- 다음 공간 예약: 내 가장 가까운 미래 예약 한 건(FB-02 유지)
- 오늘 일정 요약: 오늘의 예약과 동아리 일정을 시간순 최대 3건, 일정 화면 링크

## DATA CONTRACT

### `admins/{uid}` (Console 전용)

```ts
interface AdminMarker {
  name?: string;        // 운영 메모용, 권한 판단에 사용하지 않음
  createdAt?: Timestamp;
}
```

### `events/{eventId}`

```ts
interface ClubEvent {
  title: string;              // 1..60
  description: string | null; // null 또는 1..500
  location: string | null;    // null 또는 1..60
  startAt: Timestamp;
  endAt: Timestamp | null;    // allDay면 null, 아니면 null 또는 startAt 이후 72시간 이내
  allDay: boolean;            // true면 startAt은 KST 00:00
  createdBy: string;          // 작성자 uid, immutable
  createdAt: Timestamp;       // immutable
  updatedAt: Timestamp;
}
```

capability 문서 9절 모델과 동일하며 필드를 추가하지 않는다.

## SECURITY RULES CONTRACT

- `isAdmin()`: 검증된 Google 사용자 + `admins/{request.auth.uid}` 존재
- `admins`: read는 본인 문서만, write는 항상 거부
- `events` read: 검증된 Google 사용자
- `events` create: 검증된 회원(통합 후, 이전에는 `isAdmin()`) + 엄격한 스키마 + `createdBy == request.auth.uid`
  + `createdAt == updatedAt == request.time`
- `events` update: 작성자 또는 `isAdmin()` + 스키마 재검증 + `createdBy`, `createdAt` 불변
  + `updatedAt == request.time`
- `events` delete: 작성자 또는 `isAdmin()`
- `settings` 쓰기 계속 거부, 예약·슬롯 규칙 변경 없음, 기본 거부 유지
- 종일 일정의 자정 검증: `startAt.toMillis() % 86400000 == 54000000`(KST 00:00 = UTC 15:00)

Rules를 수정하기 전에 `tests/firestore.rules.test.ts`를 먼저 확장한다.

## QUERY CONTRACT

- 선택일 예약: 기존 `reservations where dayKey == day orderBy startAt`
- 기간 일정: `events where startAt >= from and startAt < to orderBy startAt`
  - 여러 날 일정을 놓치지 않도록 `from`을 72시간 앞당겨 조회한 뒤 겹침으로 거른다.
- 월 표식: 표시 중인 달 기준 같은 방식의 기간 조회 1회
- 홈 다음 일정: `events where startAt >= now - 72h orderBy startAt limit 20` 후 미종료 첫 건
- 모두 단일 필드 범위 쿼리이므로 새 복합 인덱스는 필요 없다.

## RECOMMENDED CODE SHAPE

```text
src/heenari/admin/
  adminAccess.ts          fetchIsAdmin(uid)
src/heenari/schedule/
  types.ts
  eventPolicy.ts          검증·입력 변환(순수)
  timeline.ts             예약+일정 병합·필터·겹침(순수)
  eventRepository.ts      Firestore 쿼리·쓰기(동적 import)
  useDayTimeline.ts
  useMonthEventDays.ts
  useUpcomingEvent.ts
  ScheduleCalendar.tsx
  ScheduleTimeline.tsx
  EventSheet.tsx
```

- 순수 모듈은 Firebase에 의존하지 않는다.
- UI 컴포넌트는 Firestore를 직접 호출하지 않는다.
- Firestore SDK는 계속 동적 import로만 로드해 메인 번들에 섞지 않는다.

## REQUIRED TESTS

### 순수 함수

- 제목·설명·장소 크기 경계
- 종일 일정 자정 변환, 시간 일정 종료 순서, 72시간 경계
- 예약+일정 병합 정렬(종일 우선), 필터 3종
- 여러 날 일정의 날짜 겹침 판정
- 다음 일정 선택(진행 중·종료·종일)

### Rules

- 비로그인·미검증 사용자의 일정 읽기 거부
- 회원의 일정 create/update/delete 거부
- 관리자의 유효 일정 create/update/delete 성공
- 관리자라도 알 수 없는 필드, 긴 제목, 종료<시작, 72시간 초과, 자정 아닌 종일 일정 거부
- `createdBy` 위조, `createdBy`·`createdAt` 변경 거부
- `admins` 자기 문서 쓰기(자기 승격) 거부, 타인 admins 문서 읽기 거부, 자기 문서 읽기 허용

### UI

- 필터 전환과 상태 텍스트
- 회원에게 일정 추가 버튼 없음, 관리자에게 있음
- 일정 저장 성공 후에만 성공 표시, 실패 시 오류 표시
- 삭제 확인 단계
- 홈 다음 일정·오늘 요약 표시와 빈 상태

## MOBILE QA

360×800, 390×844, 430×932에서 가로 스크롤 없음, 필터·날짜·타임라인 항목 44px 이상,
시트 입력 16px, 시트 CTA와 하단 내비게이션 비중첩, 긴 제목·장소에서 시간 정보 유지.

## DEFINITION OF DONE

- 회원은 하나의 일정 모달로 등록하고, 동아리방 시간은 슬롯 잠금으로 겹치지 않는다.
- 일정 수정·삭제는 작성자 또는 관리자만 가능하며 Rules 테스트로 재현된다.
- 회원은 선택일의 예약과 일정을 구분 없는 한 목록으로 본다.
- 홈에 다음 일정과 오늘 요약이 정확히 표시된다.
- lint, test, coverage(80%+), build, bundle, diff check가 통과한다.
- Rules Emulator 테스트가 통과한다(로컬 Java 부재 시 CI 결과로 증명하고 기록).
- `docs/heenari-fb-03-closeout.md`에 증거와 남은 위험을 기록한다.
