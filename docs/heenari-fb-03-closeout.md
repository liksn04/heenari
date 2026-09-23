# HEENARI-FB-03 일정과 통합 홈 — Closeout

작성일: 2026-09-23
게이트: `docs/gates/HEENARI-FB-03-SCHEDULE.md`
상태: **완료, 배포됨.** 단위/UI 테스트·커버리지·빌드·번들·모바일 QA와 Rules 에뮬레이터
테스트(39개)가 모두 통과했다. PR #3 머지 후 Hosting 자동 배포와 Firestore Rules 배포까지 마쳤다.

## 결과

- 관리자 판정: Firebase Console에서만 쓰는 `admins/{uid}` 문서의 존재로 판정한다
  (2026-09-23 사용자 결정). Rules `isAdmin()`이 유일한 권한 경계이고, 클라이언트는
  `fetchIsAdmin`으로 자기 문서만 읽어 `운영진` 표시와 관리 버튼 노출에만 쓴다.
- `/schedule`: 월간 달력(일정 있는 날 표식·`일정 있음` 라벨) → 선택일 타임라인.
  예약과 동아리 일정을 종일 우선·시각순으로 합치고 `전체 / 예약 / 동아리 일정` 필터를
  제공한다. 항목마다 `예약`/`동아리 일정` 텍스트를 색상과 함께 표시한다.
  여러 날 일정(최대 72시간)은 걸친 모든 날짜에 나타난다.
- 관리자 일정 관리: `일정 추가` 바텀시트(제목·종일·시작·종료·장소·설명), 일정 항목을
  눌러 수정, 삭제는 확인 단계를 거친다. 커밋 성공 후에만 성공 표시, 권한 거부와
  네트워크 실패 메시지를 구분하고, 오프라인이면 저장·삭제를 막는다.
- 홈: 다음 동아리 일정(진행 중 포함, 미종료 최근접 1건), 다음 공간 예약(FB-02 유지),
  오늘 일정 요약(최대 3건 + 나머지 건수, 일정 화면 링크).
- Firestore SDK는 계속 동적 import만 사용한다(메인 번들 126.3 → 144.1 KiB,
  Firestore 청크 548.9 KiB 별도 유지).
- **FB-02 결함 수정:** 예약/일정 달력이 360·390px에서 가로 스크롤을 만들고 있었다
  (44px 셀 7개 + 간격·패딩 = 372px > 본문 328/358px). FB-02 closeout의 "360px 가로 스크롤
  없음" 기록과 달리 실제 렌더러에서 `/reserve`도 scrollWidth 388(360 뷰포트)로 재현됐다.
  달력 여백·간격을 좁은 화면에서만 줄여 360–430px에서 셀 45–52px을 유지하고, 320px에서는
  셀이 39.6×44px로 줄어들도록 고쳤다(`src/heenari.css` FB-03 절).

### 예약·일정 통합 (사용자 요청, 같은 날 추가 — 위 서술보다 우선)

- 예약 탭 제거 → 하단 내비 `홈 / 일정 / 내 정보`, `/reserve` → `/schedule` 리디렉트.
- 예약과 일정을 화면에서 구분하지 않는다. `일정 추가` 버튼 하나와 일정 모달(`EntrySheet`)
  하나로 모든 회원이 등록한다. 필터는 없앴고 목록은 장소·작성자·`내 일정`만 표시한다.
- 저장 방식은 장소로 자동 판단(사용자 결정): 동아리방 + 시간 지정 → FB-02 예약 트랜잭션
  (30분 슬롯 잠금·겹침 방지), 그 밖(다른 장소·종일·여러 날) → 잠그지 않는 `events`.
- 같은 모달로 수정·삭제: 본인 시작 전 예약(시간 변경 포함, `rescheduleReservation`),
  본인 일정, 관리자는 모든 일정. 예약↔일정 종류 변경은 막고 재등록을 안내한다.
- Rules: `events` create를 모든 검증 회원(본인 명의)으로, update/delete를 작성자 또는
  관리자로 넓혔다. 테스트 4개를 먼저 추가해 실패를 확인한 뒤 수정했다.
- 삭제(통합 후 미사용): `ReservationScheduler`, `ReservationCalendar`, `ReservationModal`,
  `ReservationForm`, `useDayReservations`, `daySlots`, `selection`, `EventSheet`와 각 테스트.

### 동아리방 30분 시간 선택 (사용자 요청, 같은 날 추가)

- 동아리방 + 시간 지정일 때 시작·종료를 `<select>` 30분 선택지로 바꿨다(모바일 time 입력은
  `step`을 무시해 1분 단위였다). 종료 선택지는 시작+30분부터 최대 4시간·24:00까지, 길이를 함께
  표시(`20:00 (2시간)`). 종료 날짜 입력은 동아리방에서 숨긴다. 다른 장소는 기존 time 입력 유지.
- `entry.ts`에 `ROOM_START_TIMES`, `roomEndOptions`, `snapToRoom` 추가. 모든 선택지 조합이
  슬롯 예약으로 저장되는지 전수 테스트했다.
- QA: 360(세로 배치)·390·430(가로 배치)에서 드롭다운 54px·16px, 가로 스크롤 없음.

### 태그와 합주 1시간 제한 (사용자 요청, 같은 날 추가)

- 모달에 `태그: 합주 / 강습 / 기타`(기본 합주)를 추가했다. 동아리방에서 **합주는 최대 1시간**,
  강습·기타는 길이 제한 없이 09:00–24:00 안에서 고른다(기존 4시간 제한 제거). 종료 드롭다운이
  태그에 맞춰 바뀌고, 합주로 바꾸면 1시간 안으로 줄어든다. 목록에 태그 라벨을 표시한다.
- Rules: `reservations`·`events`에 선택 필드 `tag`(jam·lesson·etc) 추가, 예약 합주는 2슬롯 이하,
  전체 30슬롯 이하. 태그 없는 기존 문서 허용. 테스트 6개를 먼저 추가해 실패 확인 후 수정했고,
  **하루 전체(30슬롯) 예약+슬롯 배치가 Rules 문서 접근 한도 안에서 통과**하는 것도 에뮬레이터로 확인했다.
- 검증: vitest 176 · coverage 97.53/93.13/98.31/98.17 · Rules 39 · build · bundle(메인 143.8 KiB) 통과.
  변이: Rules 합주 제한 제거 시 2개, 클라이언트 합주 제한 제거 시 6개 테스트 실패 → 복원 후 통과.
  QA: 360/390/430 가로 스크롤 없음, 태그 버튼 44px, 합주 종료 선택지 2개·강습 12개(18:00 기준) 확인.
- 남은 위험: 태그는 회원이 스스로 고르므로 합주를 `기타`로 등록하면 1시간 제한을 피할 수 있다
  (운영 규칙으로 관리할 부분). 기존 운영 예약은 태그 없이 표시된다.

## 변경 파일

신규:
- `docs/gates/HEENARI-FB-03-SCHEDULE.md` — 게이트 문서(관리자 권한 결정 포함)
- `src/heenari/admin/adminAccess.ts`
- `src/heenari/schedule/` — `types.ts`, `eventPolicy.ts`, `timeline.ts`, `eventRepository.ts`,
  `useScheduleData.ts`, `ScheduleCalendar.tsx`, `ScheduleTimeline.tsx`, `EventSheet.tsx`,
  `ScheduleBoard.tsx` 및 테스트 6개

수정:
- `firestore.rules` — `isAdmin()`, `eventShape()`, `admins`(본인 읽기·쓰기 거부),
  `events` 관리자 create/update/delete. 예약·슬롯 규칙은 변경 없음
- `tests/firestore.rules.test.ts` — 시드 일정을 유효 스키마로 교체, admins 4 + events 9 케이스
- `src/heenari/auth/AuthContext.tsx` — 진입 후 관리자 역할 비동기 반영(진입 지연 없음)
- `src/heenari/pages.tsx` — 홈 다음 일정·오늘 요약, `SchedulePage` → `ScheduleBoard`
- `src/heenari/ui.test.tsx`, `vitest.config.ts` — 일정 훅 mock, 신규 모듈 coverage 포함
- `src/heenari.css` — 일정 스타일(기존 토큰만 사용, `:root` 미변경), 달력 폭 보정
- `AI_START_HERE.md`, `AGENTS.md`, `docs/heenari-lite-capability.md` — 활성 게이트 FB-03,
  관리자 권한 결정 반영 / `docs/gates/HEENARI-FB-02-RESERVATION.md` — 상태 완료

## 검증

로컬 실행 결과(모두 통과):
- `npm run lint` — 0 error
- `npm test` — 18 files / **160 tests pass** (통합 후 기준, 삭제한 슬롯 그리드 테스트 제외)
- `npm run test:coverage` — Stmts 97.4% · Branches 92.39% · Funcs 98.64% · Lines 98.22%
- `npm run build` — 통과 (`tsc -b` 포함)
- `npm run check:bundle` — 통과 (최대 JS = 지연 로드 Firestore 청크 548.9 KiB < 600 KiB, 메인 141.1 KiB)
- `git diff --check` — 깨끗
- `npm run test:rules` — **33 tests pass** (FB-02 15 + FB-03 18, 회원 일정 권한 테스트 포함). 로컬 OpenJDK 21
  (Homebrew `openjdk@21` 21.0.12.1, keg-only, PATH는 명령 실행 시에만 지정)로 실행
- Rules 변이 확인: `isAdmin()`에서 `exists()` 제거 + `admins` 쓰기 허용 + 72시간 제한 제거
  변이를 넣으면 4개 테스트(자기 승격·관리자 admins 쓰기·회원 일정 쓰기·스키마 위반)가
  실패하고, 원본 복원(`cmp` 동일) 후 29개 전부 통과
- 통합 변이 확인: 저장 방식 판단(동아리방→예약)을 끄고 일정 수정 권한을 모두 허용하는 변이를
  넣으면 12개 테스트가 실패하고, 복원 후 160개 통과
- 변이 확인: 관리자 버튼을 회원에게 노출·종일 정렬 제거 변이를 넣으면 4개 테스트가
  실패하고, 복원 후 전부 통과

모바일 QA (Vite 실제 렌더러, 인증·데이터만 QA 전용 mock으로 대체, 저장소 밖 하네스):
- 360×800 / 390×844 / 430×932 × `/`, `/schedule`(관리자), `/reserve`, `/me`:
  scrollWidth == 뷰포트 폭, 44px 미만 터치 대상 0개, 달력 셀 45 / 46 / 52px
- 320×700: 가로 스크롤 없음, 달력 셀 39.6×44px(그리드 안에 정확히 들어감)
- 일정 시트: 입력 8개 모두 16px, 버튼 높이 44/57px, 오버레이 z 40 > 하단 내비 z 20,
  스크롤로 모든 입력과 저장 CTA 접근 가능
- 실제 클릭 흐름: 일정 추가 → 시트 닫힘 + `일정을 추가했어요.` / 여러 날 일정 수정 시트
  값 정확히 복원(종료 날짜 포함) / 삭제 → 확인 단계 → `일정을 삭제했어요.`
- 긴 이름·제목·장소: 제목·장소 줄바꿈, 시간·종류 라벨 유지 / 콘솔 에러 0

통합 모바일 QA (같은 하네스, 일반 회원 시점):
- 360 / 390 / 430 / 320 × `/`, `/me`, `/schedule`: scrollWidth == 뷰포트, 44px 미만 터치 대상 0개
  (320px 달력 셀 40×44 제외), 모달 입력 16px, 장소 토글 44px
- 실제 흐름: `일정 추가` → 동아리방 기본값으로 저장 → `일정을 추가했어요.` / `다른 장소` 선택 시
  장소 이름 입력과 "잡아두지 않아요" 안내 / 내 동아리방 일정 수정 → 22:10 입력 시
  `동아리방은 09:00–24:00 사이 30분 단위로…` 안내, 22:30으로 저장 → `일정을 수정했어요.`
- 목록: 예약·일정이 한 목록, 필터 없음, 본인 항목만 `내 일정` + 수정 아이콘

## 생략한 검증과 사유

- 실제 Firebase 프로젝트에서의 관리자 흐름(Console로 `admins` 문서 생성 → 앱 반영)은
  확인하지 않았다(Rules는 배포됨, Console에서 `admins` 문서 생성 후 확인 필요).
- 모바일 QA는 로그인 없이 화면을 띄우려고 인증·데이터 훅을 mock으로 바꾼 하네스에서
  했다. 레이아웃·상호작용은 실제 컴포넌트·CSS 그대로지만 Firestore 왕복은 포함되지 않는다.
- 키보드가 열린 상태의 iOS 실기기 확인은 하지 않았다.
- `/reserve` → `/schedule` 리디렉트는 `App.tsx` 라우트 코드로만 확인했다(QA 하네스는 `App`의
  인증 라우팅을 거치지 않음, `App.tsx`는 단위 테스트 대상이 아님).

## 남은 리스크

- Rules는 에뮬레이터 39개 통과 후 배포했다. 운영 환경에서 태그 예약·회원 일정 추가를 실제로
  눌러 보는 확인은 아직 하지 않았다.
- 관리자 판정마다 `exists()` 문서 읽기 1회가 추가된다(일정 쓰기 빈도가 낮아 무료 한도에
  영향 없음으로 판단).
- 관리자 역할 표시는 로그인 시 1회 확인한다. Console에서 권한을 바꾸면 새로고침해야
  화면에 반영된다(Rules 판정은 즉시 반영).
- 관리자의 타인 예약 정리는 이번 게이트 비목표로 남았다(capability 3절 관리자 권한 중 미구현).
- 슬롯 그리드가 없어져 빈 시간을 한눈에 고르는 화면은 없다. 선택일 목록에서 동아리방 시간을
  보고 입력하며, 겹치면 저장 시 `방금 다른 회원이 이 시간을 예약했어요.`로 막힌다.
- 동아리방 종일 일정과 동아리방이라고 적은 여러 날 일정은 슬롯을 잠그지 않는다(결정 사항).
- 모든 회원이 일정을 만들 수 있게 되어 스팸성 등록은 관리자가 삭제로 정리해야 한다.
- 일정 시간대는 입력값을 KST로 해석한다. 기기 시간대가 달라도 표시·저장은 KST 기준이다.

## 다음 handoff

1. 사용자 요청 시 커밋·PR(CI `verify`가 Rules를 재검증).
2. 사용자 요청 시 PR 병합 → Hosting 자동 배포, `npx -y firebase-tools@latest deploy --only firestore`로
   Rules 배포 후 원격 Rules 재확인. 새 복합 인덱스는 필요 없다.
3. Console에서 운영진 `admins/{uid}` 문서 생성(절차: 게이트 문서 "관리자 지정 절차").
4. 후속 후보: 관리자 예약 정리 게이트, 또는 capability 16절 Gate 4 출시 준비.

## 관련 커밋

- `2a6fe98` feat: HEENARI-FB-03 예약·일정 통합 화면과 태그
- PR: [liksn04/heenari#3](https://github.com/liksn04/heenari/pull/3) — CI `verify`·`build_and_preview`·`Deploy Preview` 통과
- 머지: `5608751` Merge PR #3 → Hosting 자동 배포 성공
- Firestore Rules·인덱스: 머지 후 `npx -y firebase-tools@latest deploy --only firestore`로 배포
  (컴파일 성공, `released rules firestore.rules to cloud.firestore`). 배포한 파일은 `origin/main`과 해시 일치
- 기준 커밋: `34a2465 Merge PR #2: authDomain·OAuth 리디렉션 URI 제약 문서화`
