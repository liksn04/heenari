# HEENARI-FB-02 30분 예약 엔진 — Closeout

작성일: 2026-09-22
게이트: `docs/gates/HEENARI-FB-02-RESERVATION.md`
상태: 코드·테스트·문서 완료. **에뮬레이터 Rules 테스트는 로컬 Java 부재로 차단(미실행).**

## 결과

- 검증된 Google 회원이 큰 월간 달력에서 날짜를 고르고 → `예약하기` → 모달에서
  연속 30분 슬롯을 선택해 하나의 공간을 예약할 수 있다. (사용자 요청으로 초기
  "슬롯 즉시 노출" 대신 "달력 선택 후 모달" 흐름으로 구현.)
- 예약 생성/시간변경/취소와 슬롯 잠금을 원자적 Firestore 트랜잭션으로 처리한다.
  트랜잭션 본문은 주입 가능한 `WriteTransaction` 인터페이스로 분리해 에뮬레이터
  없이도 read-before-write 순서·충돌 검출·소유권·과거 예약 차단을 단위 테스트했다.
- 슬롯 상태를 색상 외 텍스트(`예약 가능`/`내 예약`/`예약됨`/`지난 시간`/`선택함`)로
  표기하고, 충돌 시 선택을 보존하며 최신 상태를 재조회한다. 오프라인이면 확정을
  막는다.
- Firestore Rules에 예약/슬롯 create·update·delete validator를 추가하고, indexes와
  Rules 테스트(18케이스)를 확장했다.
- Firestore SDK를 정적 import로 끌어들이지 않도록 repository를 동적 import로
  리팩터해 메인 번들(≈126 KiB)과 Firestore 청크(≈549 KiB, 인증 후 지연 로드)를
  분리 유지했다.

## 변경 파일

신규 `src/heenari/reservations/`:
- 순수 도메인: `types.ts`, `slots.ts`, `policy.ts`, `daySlots.ts`, `selection.ts`,
  `calendar.ts`, `messages.ts`
- 데이터 계층: `repository.ts`(트랜잭션·쿼리·동적 로드), 훅 `useDayReservations.ts`,
  `useMyUpcomingReservations.ts`, `useOnlineStatus.ts`
- UI: `ReservationCalendar.tsx`, `ReservationModal.tsx`, `ReservationScheduler.tsx`,
  `ReservationForm.tsx`, `ReservationList.tsx`
- 각 모듈 테스트 `*.test.ts(x)` (총 17개 테스트 파일)

수정:
- `firestore.rules` — 예약/슬롯 validator, getAfter 고아 슬롯 차단, 슬롯 update 거부
- `firestore.indexes.json` — `reservations(dayKey,startAt)`, `reservations(ownerId,startAt)`
- `src/heenari/pages.tsx` — ReservePage→ReservationScheduler, 홈 다음 예약, MyPage 내 예정 예약
- `src/heenari.css` — 슬롯/CTA/달력/모달 스타일 (기존 토큰 재사용, `:root` 미변경)
- `src/heenari/ui.test.tsx` — 예약/일정 페이지 기대치 갱신, 예약 훅 mock
- `tests/firestore.rules.test.ts` — 예약·슬롯 Rules 테스트 확장
- `vitest.config.ts` — 예약 소스 coverage include 추가

## 검증

로컬 실행 결과(모두 통과):
- `npm run lint` — 0 error
- `npm test` — 18 files / **120 tests pass**
- `npm run test:coverage` — Stmts 94.82% · **Branches 85.23%** · Funcs 94.11% · Lines 96.45% (임계 80% 초과)
- `npx tsc -b` — 통과
- `npm run build` — 통과, import 경고 없음
- `npm run check:bundle` — 통과 (최대 JS = 지연 로드 Firestore 청크 548.9 KiB < 600 KiB, 메인 126.3 KiB)
- `git diff --check` — 깨끗

모바일 QA (Vite 실제 렌더러, 360×800 / 390×844 / 430×932):
- 가로 스크롤 없음(scrollWidth == innerWidth, app-frame 정확히 폭 일치)
- 달력 날짜 셀 44–48px, 슬롯 52px, CTA 57px, 입력 16px(iOS 확대 방지)
- 하단 고정 CTA와 앱 하단 내비 미겹침(360px에서 33px 간격)
- 달력: 과거일 비활성, 오늘 표시, 선택 강조 / 모달: 바텀시트, 슬롯 스크롤 + 스티키 확정
- 콘솔 에러 0

## 생략한 검증과 사유

- **`npm run test:rules` — 차단(미실행).** 로컬에 Java Runtime이 없어 Firestore
  에뮬레이터를 기동할 수 없다. 실행 시 다음으로 실패:
  `Process 'java -version' has exited with code 1. ... Unable to locate a Java Runtime.`
  → `tests/firestore.rules.test.ts`는 작성 완료했으나 실행 검증은 하지 못했다.
- 세션에 Firebase MCP validator가 없어 `firestore.rules` **구문의 로컬 검증도 불가**.
  Rules 파일은 리뷰로만 확인했고 실제 컴파일/평가는 미검증 상태다.
- **진짜 동시성("같은 슬롯 동시 요청 중 정확히 하나만 성공")**은 에뮬레이터가
  있어야 재현 가능하다. 현재는 트랜잭션 로직의 충돌 검출을 mock으로 단위
  검증했을 뿐, 실제 경쟁 조건은 미검증.
- live 배포/commit/push는 문서 지침대로 미수행(별도 요청 없음).

## 남은 리스크

- Firestore Rules와 Rules 테스트가 **에뮬레이터에서 미검증**이다. Java가 있는
  환경(CI 또는 로컬 JDK 설치)에서 `npm run test:rules`를 반드시 통과시켜야
  게이트 DoD("Rules Emulator 테스트가 통과한다")를 충족한다. getAfter/existsAfter,
  `keys().hasOnly`, `toMillis()` 산술 등은 구문 오류 가능성이 있으니 첫 실행에서
  실패할 수 있음을 전제로 확인할 것.
- Rules 배포 전 원격 인덱스 생성이 필요하다(`reservations` 복합 인덱스 2종).
  인덱스 없이 쿼리하면 런타임 오류가 난다.
- 예약 수정(시간 변경) 트랜잭션 로직·Rules는 구현했으나 이번 게이트 UI에는
  시간 변경 화면을 노출하지 않았다(제목/메모 수정과 취소만 UI 연결). 시간 변경
  UI는 후속 작업.
- `settings/club` 문서가 없으면 클라이언트는 코드 상수(`RESERVATION_POLICY`)로
  동작한다. 운영 값이 상수와 달라지면 문서/상수를 함께 갱신해야 한다.

## 다음 handoff

- **선결(차단 해제):** Java 설치 환경에서 `npm run test:rules` 실행 → Rules/동시성
  테스트 통과 확인, 실패 시 `firestore.rules` 수정. 필요하면 원격 인덱스 배포.
- **HEENARI-FB-03 일정과 통합 홈:** 관리자 일정 CRUD + 회원 통합 일정 화면.
  관리자 권한(Custom Claims 등) 신뢰 소스 도입은 별도 보안 게이트.

## 관련 커밋

- 아직 커밋하지 않음(사용자 요청 시 커밋). 기준 커밋: `2a31e4e feat: initialize Heenari mobile reservation app`
