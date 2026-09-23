# HEENARI-FB-02 30분 예약 엔진 — Closeout

작성일: 2026-09-22
게이트: `docs/gates/HEENARI-FB-02-RESERVATION.md`
상태: 완료. Rules 에뮬레이터 테스트는 CI(Java 17)에서 15개 전부 통과했고,
**프로덕션(`https://heenari-9f2a6.web.app`)에서 Google 로그인과 예약 생성까지 실사용으로 확인됨.**

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
  Rules 테스트(15케이스)를 확장했다. **CI 에뮬레이터에서 15개 전부 통과.**
- Firestore SDK를 정적 import로 끌어들이지 않도록 repository를 동적 import로
  리팩터해 메인 번들(≈126 KiB)과 Firestore 청크(≈549 KiB, 인증 후 지연 로드)를
  분리 유지했다.
- GitHub Actions로 CI(lint·test·test:rules·build·bundle)와 Firebase Hosting 자동
  배포(main 병합 시 live, PR 미리보기)를 구성했다.

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

CI (GitHub Actions `verify`, Node 22 + Java 17 — 전부 통과, run 35707124914):
- `npm run lint` · `npm test`(120) · **`npm run test:rules` — 15 tests pass** · `npm run build` · `npm run check:bundle`
- 로컬에서 막혔던 Firestore Rules 에뮬레이터 테스트가 CI에서 실제로 검증됨.

모바일 QA (Vite 실제 렌더러, 360×800 / 390×844 / 430×932):
- 가로 스크롤 없음(scrollWidth == innerWidth, app-frame 정확히 폭 일치)
  - **정정(2026-09-23, FB-03):** 달력이 360·390px에서 실제로는 가로 스크롤을 만들었다
    (달력 372px). FB-03에서 수정했다. `docs/heenari-fb-03-closeout.md` 참조.
- 달력 날짜 셀 44–48px, 슬롯 52px, CTA 57px, 입력 16px(iOS 확대 방지)
- 하단 고정 CTA와 앱 하단 내비 미겹침(360px에서 33px 간격)
- 달력: 과거일 비활성, 오늘 표시, 선택 강조 / 모달: 바텀시트, 슬롯 스크롤 + 스티키 확정
- 콘솔 에러 0

## 생략한 검증과 사유

- **`npm run test:rules` — 로컬 미실행(Java 부재), CI에서 검증됨.** 로컬에는 Java
  Runtime이 없어 에뮬레이터를 기동할 수 없다(`Unable to locate a Java Runtime`).
  대신 CI `verify` 잡이 Java 17로 실행해 `tests/firestore.rules.test.ts` **15개
  전부 통과**했다. `firestore.rules`의 컴파일·평가(getAfter/existsAfter,
  `keys().hasOnly`, `toMillis()` 포함)가 실제로 검증됐다.
- **진짜 동시성("같은 슬롯 동시 요청 중 정확히 하나만 성공")**은 별도 에뮬레이터
  경쟁 테스트를 아직 작성하지 않았다. 트랜잭션 충돌 검출은 mock 단위 테스트로,
  슬롯 결정적 문서 ID + Rules 스키마는 CI에서 검증했으나, 동시 create 레이스
  자체를 재현하는 통합 테스트는 후속 과제다.
- (해소) live 배포까지 완료했다. PR #1 병합 → Hosting 자동 배포, Firestore Rules와
  인덱스는 `firebase deploy --only firestore`로 별도 배포했다.

## 남은 리스크

- (해소) Firestore Rules와 Rules 테스트는 CI `verify`에서 에뮬레이터로 검증돼
  15개 전부 통과했다. 게이트 DoD "Rules Emulator 테스트가 통과한다"를 충족한다.
  로컬에서 재현하려면 JDK 설치 후 `npm run test:rules`.
- (해소) 복합 인덱스 2종(`reservations(dayKey,startAt)`, `reservations(ownerId,startAt)`)을
  배포하고 `firestore:indexes`로 원격에서 직접 읽어 확인했다.
- 예약 수정(시간 변경) 트랜잭션 로직·Rules는 구현했으나 이번 게이트 UI에는
  시간 변경 화면을 노출하지 않았다(제목/메모 수정과 취소만 UI 연결). 시간 변경
  UI는 후속 작업.
- `settings/club` 문서가 없으면 클라이언트는 코드 상수(`RESERVATION_POLICY`)로
  동작한다. 운영 값이 상수와 달라지면 문서/상수를 함께 갱신해야 한다.

## 다음 handoff

- (완료) 시크릿 등록 → PR 병합 → Hosting 자동 배포, Firestore Rules·인덱스 별도 배포까지
  마쳤다. 운영 중 배포 제약은 `AI_START_HERE.md` 3절을 따른다(특히 authDomain은
  `web.app`이어야 하고 OAuth 리디렉션 URI가 짝으로 등록돼 있어야 함).
- **HEENARI-FB-03 일정과 통합 홈:** 관리자 일정 CRUD + 회원 통합 일정 화면.
  관리자 권한(Custom Claims 등) 신뢰 소스 도입은 별도 보안 게이트.

## 관련 커밋

- `35930d1` feat: HEENARI-FB-02 30분 예약 엔진 구현
- `bf9f2e1` ci: GitHub Actions로 CI와 Firebase Hosting 자동 배포 구성
- PR: [liksn04/heenari#1](https://github.com/liksn04/heenari/pull/1) (CI `verify` 통과)
- 기준 커밋: `2a31e4e feat: initialize Heenari mobile reservation app`
