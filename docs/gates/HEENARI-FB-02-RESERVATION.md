# HEENARI-FB-02 — 30분 예약 엔진

상태: 완료 (`docs/heenari-fb-02-closeout.md`)
선행 게이트: Google 인증·Firestore·Hosting 완료
Source of truth: `docs/heenari-lite-capability.md`

## CAPABILITY

검증된 Google 사용자는 모바일에서 날짜와 연속된 30분 슬롯을 선택해 하나의
동아리 공간을 예약하고, 자신의 미래 예약을 수정·취소할 수 있다. 여러 사용자가
동시에 같은 슬롯을 요청해도 정확히 하나의 예약만 성공해야 한다.

## GATE BOUNDARY

```text
Gate: HEENARI-FB-02 30분 예약 엔진
Goal: 날짜별 슬롯 조회와 원자적 예약 생성·수정·취소를 구현한다.
Non-goals: 동아리 일정 CRUD, 관리자 권한, 반복 예약, 승인제, 대기열, 알림, 여러 공간
Allowed surface: src/heenari/reservations/, 예약 화면, 홈의 다음 예약, firestore.rules, indexes, tests
Forbidden surface: Auth provider 변경, 회원 허용 목록, Hosting 설정, 기존 브랜드 토큰 재설계
Validation: unit/UI coverage 80%+, Rules tests, 동시 충돌 테스트, 모바일 QA, build, bundle
Closeout: docs/heenari-fb-02-closeout.md
Next handoff: HEENARI-FB-03 일정과 통합 홈
```
## FIXED PRODUCT POLICY

- 공간 수: 1개
- 시간대: `Asia/Seoul`
- 슬롯 단위: 30분
- 예약 가능 시간 기본값: 09:00–24:00
- 최소 예약: 1슬롯, 30분
- 최대 연속 예약: 8슬롯, 4시간 — **FB-03에서 태그 규칙으로 대체**(합주 1시간, 강습·기타 제한 없음)
- 예약 가능 기간: 오늘부터 60일
- 선택 슬롯은 비어 있고 연속되어야 한다.
- 시작 시각이 지난 예약은 일반 사용자가 수정·취소할 수 없다.
- 별도 승인 없이 예약 즉시 확정
- 모든 검증된 Google 사용자는 동일한 일반 회원 권한을 가진다.

운영 시간과 최대 길이는 이번 게이트에서 관리자 UI로 만들지 않는다. 타입이
있는 상수로 두되 Firestore Rules와 클라이언트가 동일한 값을 사용하도록 테스트로
고정한다.

## USER JOURNEYS

### 날짜별 예약 확인

1. 예약 화면 진입 시 오늘을 선택한다.
2. 오늘부터 60일 범위에서 날짜를 바꿀 수 있다.
3. 09:00부터 24:00까지 30분 슬롯을 표시한다.
4. 각 슬롯은 `예약 가능`, `내 예약`, `예약됨` 텍스트를 포함한다.

### 예약 생성

1. 사용자가 비어 있는 슬롯을 누른다.
2. 선택 범위는 연속된 슬롯만 유지한다.
3. 인접 슬롯을 누르면 범위가 확장된다.
4. 선택된 슬롯을 다시 누르면 선택을 해제한다.
5. 비연속 슬롯을 누르면 기존 선택을 지우고 해당 슬롯에서 다시 시작한다.
6. 제목을 1–40자로 입력하고 선택 메모를 최대 200자로 입력한다.
7. 하단 고정 CTA에서 날짜·시간·길이를 확인하고 예약을 확정한다.
8. 트랜잭션 커밋 성공 후에만 성공 상태를 표시한다.

### 충돌 처리

1. 확정 직전 트랜잭션에서 선택한 모든 슬롯 문서를 다시 읽는다.
2. 하나라도 존재하면 쓰기를 수행하지 않는다.
3. `방금 다른 회원이 이 시간을 예약했어요.`를 표시한다.
4. 선택을 보존하고 최신 슬롯 상태를 다시 불러온다.

### 예약 수정

- 제목·메모만 바꾸면 예약 문서만 검증된 update로 변경한다.
- 시간 변경은 기존 슬롯 삭제와 새 슬롯 획득을 하나의 트랜잭션에서 처리한다.
- 새 슬롯 획득이 실패하면 기존 예약과 기존 슬롯을 유지한다.

### 예약 취소

- 자신의 미래 예약만 취소한다.
- 예약과 `slotIds`에 포함된 슬롯 문서를 하나의 트랜잭션으로 삭제한다.
- 부분 삭제 상태를 허용하지 않는다.

## DATA CONTRACT

### `reservations/{reservationId}`

```ts
interface Reservation {
  title: string;              // 1..40
  note: string | null;        // null or 0..200
  ownerId: string;            // Firebase uid, immutable
  ownerName: string;          // Auth token display name snapshot, 1..60
  startAt: Timestamp;         // 30분 경계
  endAt: Timestamp;           // startAt 이후, 최대 4시간
  dayKey: string;             // YYYY-MM-DD, Asia/Seoul
  slotIds: string[];          // 1..8, 정렬·연속·중복 없음
  createdAt: Timestamp;       // immutable
  updatedAt: Timestamp;
}
```

### `reservationSlots/{slotId}`

```ts
interface ReservationSlot {
  reservationId: string;
  ownerId: string;
  dayKey: string;
  startsAt: Timestamp;
  createdAt: Timestamp;
}
```

- `slotId`: `YYYY-MM-DD_HH-mm`
- 슬롯 문서는 update하지 않는다. create와 delete만 허용한다.
- 동일 시간 충돌은 결정적 문서 ID로 차단한다.
- 날짜·시간 Timestamp 생성 시 `+09:00`을 명시해 실행 환경 시간대에 의존하지 않는다.

## TRANSACTION CONTRACT

### 생성

1. 예약 ID를 미리 생성한다.
2. 트랜잭션에서 모든 대상 슬롯 문서를 먼저 읽는다.
3. 하나라도 존재하면 `SlotConflictError`를 던진다.
4. 예약 문서를 작성한다.
5. 모든 슬롯 문서를 작성한다.
6. 읽기 이후에만 쓰기를 수행한다.

### 시간 변경

1. 기존 예약과 기존 슬롯, 새 슬롯을 모두 먼저 읽는다.
2. 새 슬롯 중 기존 예약 소유가 아닌 문서가 존재하면 실패한다.
3. 기존 슬롯 삭제, 예약 update, 새 슬롯 create를 한 번에 커밋한다.

### 취소

1. 예약과 `slotIds`의 슬롯 문서를 모두 읽는다.
2. 로그인 사용자와 `ownerId`가 일치하는지 확인한다.
3. 슬롯과 예약을 한 번에 삭제한다.

클라이언트 트랜잭션은 UX를 위한 1차 검증이며 Firestore Rules가 최종 권한
경계다.

## SECURITY RULES CONTRACT

모든 create/update는 전용 validator function을 사용한다.

### 공통

- 검증된 Google provider 필수
- 예상 필드만 허용: `keys().hasOnly(...)`
- 모든 문자열·목록에 크기 제한
- Timestamp 타입과 시간 순서 검증
- `ownerId == request.auth.uid`
- `createdAt`, `ownerId` 변경 금지
- 다른 사용자의 예약 수정·삭제 금지
- `events`와 `settings` 쓰기는 계속 금지
- 기본 거부 유지

### 예약

- create: 엄격한 스키마, owner, 1–8개 slotIds, 미래 시간
- update: validator 재사용, immutable 필드 보호, 본인 미래 예약만
- delete: 본인 미래 예약만

### 슬롯

- 결정적 document ID 사용
- create: ownerId 일치, 엄격한 스키마, 대응 예약이 batch 이후 존재함을 `getAfter()`로 확인
- update: 항상 거부
- delete: ownerId 일치, 대응 예약의 삭제·변경 트랜잭션과 함께 수행

Rules를 수정하면 `tests/firestore.rules.test.ts`를 먼저 확장한다. Emulator 테스트를
실행할 수 없다면 완료가 아니라 차단 상태로 기록한다.

## RECOMMENDED CODE SHAPE

```text
src/heenari/reservations/
  types.ts
  policy.ts
  slots.ts
  repository.ts
  useDayReservations.ts
  ReservationForm.tsx
  ReservationList.tsx
  *.test.ts(x)
```

- `policy.ts`, `slots.ts`: Firebase에 의존하지 않는 순수 함수
- `repository.ts`: Firestore 쿼리와 트랜잭션만 담당
- UI 컴포넌트: 직접 Firestore 호출 금지
- 기존 프로젝트에 TanStack Query를 다시 추가하지 않는다.

## REQUIRED TESTS

### 순수 함수

- 09:00–24:00 슬롯 생성
- 30분 경계 판정
- Asia/Seoul Timestamp 변환
- 연속·중복 슬롯 검증
- 1슬롯/8슬롯 경계
- 9슬롯 거부
- 오늘 이전·60일 이후 거부

### 트랜잭션

- 빈 슬롯 예약 성공
- 같은 슬롯 동시 요청 중 하나만 성공
- 다중 슬롯 중 하나가 점유되면 전체 실패
- 실패 후 부분 reservation/slot 문서 없음
- 시간 변경 실패 시 기존 예약 유지
- 취소 시 예약과 모든 슬롯 삭제

### Rules

- 비로그인 읽기·쓰기 거부
- Google 외 provider 거부
- 다른 ownerId로 create 거부
- 다른 사용자의 update/delete 거부
- ownerId·createdAt 변경 거부
- 알 수 없는 필드, 잘못된 타입, 과도한 문자열·배열 거부
- 슬롯 update 거부
- 고아 슬롯 create 거부

### UI

- 모바일 슬롯 상태 텍스트
- 연속 선택과 비연속 reset
- CTA 선택 요약
- 충돌 메시지와 선택 보존
- 네트워크 실패 시 성공 표시 금지

## MOBILE QA

검증 뷰포트:

- 360×800
- 390×844
- 430×932

확인 항목:

- 가로 스크롤 없음
- 날짜 선택과 슬롯의 최소 터치 영역 44px
- 하단 CTA와 앱 내비게이션이 겹치지 않음
- 긴 이름·제목에서도 시간 정보가 잘리지 않음
- 키보드가 열린 상태에서 제목·메모·CTA 접근 가능
- 색상만으로 예약 상태를 구분하지 않음

## INDEXES

예약 날짜 조회에 필요한 인덱스를 `firestore.indexes.json`에 기록한다.

예상 쿼리:

```text
reservations where dayKey == selectedDay orderBy startAt asc
reservations where ownerId == uid and startAt >= now orderBy startAt asc
```

Firebase가 요구하는 실제 인덱스 오류를 확인해 최소 인덱스만 추가한다.

## FAILURE AND RECOVERY

- 권한 거부: 로그인 상태와 provider를 확인하고 일반 메시지 표시
- 슬롯 충돌: 데이터 손실 없이 최신 상태 refresh
- 오프라인: 예약 확정 비활성화, 오프라인 쓰기 큐에 의존하지 않음
- 알 수 없는 트랜잭션 실패: 성공으로 낙관 표시하지 않음
- 부분 데이터 발견: 새 기능 구현을 멈추고 복구 스크립트/운영 절차를 별도 게이트로 분리

## OPEN QUESTIONS

현재 Gate 2 구현을 막는 열린 질문은 없다. 관리자 권한 부여 방식과 일정 CRUD는
Gate 3에서 결정한다.

## DEFINITION OF DONE

- 예약 create/update/delete와 슬롯 잠금이 원자적으로 동작한다.
- 동시 충돌 테스트에서 정확히 하나만 성공한다.
- Rules가 권한·스키마·크기·불변 필드를 검증한다.
- 단위/UI coverage가 모든 임계값 80% 이상이다.
- Rules Emulator 테스트가 통과한다.
- 모바일 세 뷰포트에서 CTA·내비게이션·입력이 겹치지 않는다.
- lint, test, coverage, build, bundle, diff check가 통과한다.
- `docs/heenari-fb-02-closeout.md`에 증거와 남은 위험을 기록한다.

## COPY-PASTE IMPLEMENTATION PROMPT

```text
이 저장소의 AI_START_HERE.md부터 읽고 지시 순서를 따른다.
활성 게이트는 docs/gates/HEENARI-FB-02-RESERVATION.md 하나뿐이다.
TDD로 실패 테스트를 먼저 작성하고, Gate 2의 허용 surface만 수정한다.
기존 대규모 삭제와 희나리 재설계 변경을 복원하거나 덮어쓰지 않는다.
Firestore Rules를 바꾸기 전에 Rules 테스트를 확장하고, 모든 쓰기에 엄격한
validator를 적용한다. 모바일 360/390/430px을 QA하고 문서에 지정된 모든 검증을
실행한다. live 배포와 commit/push는 별도 요청 없이는 수행하지 않는다.
완료 시 docs/heenari-fb-02-closeout.md에 변경 파일, 검증 증거, 생략 항목,
남은 위험, 다음 handoff를 기록한다.
```
