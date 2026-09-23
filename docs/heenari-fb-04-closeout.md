# HEENARI-FB-04 PWA·합주 초대·알림 — Closeout

작성일: 2026-09-23
게이트: `docs/gates/HEENARI-FB-04-PWA-JAM-INVITES.md`
상태: **코드 완료, 운영 설정 대기.** 앱·Rules·Worker 코드와 테스트는 모두 통과했다. 실제 알림이
동작하려면 운영자 계정으로 하는 설정(웹 푸시 키, 서비스 계정, Cloudflare 배포, Rules 배포)이
남아 있다(`notifier/README.md`). 커밋·배포는 하지 않았다.

## 결과

- **PWA**: `manifest.webmanifest`(standalone, 테마 #E60000), 원본 로고로 만든 아이콘 4종
  (192·512·maskable 512·apple-touch 180), iOS 메타, `sw.js`(앱 셸 캐시·오프라인 폴백·푸시 표시·
  알림 클릭 이동). Firebase Auth 핸들러 `/__/`, 외부 도메인, GET 외 요청은 가로채지 않는다.
  Hosting에 `sw.js` no-cache, manifest content-type 헤더 추가. 배포 빌드에서만 SW 등록.
- **합주 초대**: 합주 태그일 때 일정 모달에 "함께할 회원" 선택(본인 제외, 최대 20명).
  초대받은 회원은 수락 없이 바로 참여자. 목록에 `초대됨`·`함께: 이름` 표시. 빠지기는 사용자 요청으로
  제거해 참여자 명단은 합주를 잡은 사람만 바꾼다(Rules도 참여자 스스로의 변경을 허용하지 않음).
  내 정보의 "내 동아리방 시간"과 홈 "내 다음 동아리방 시간"에 초대받은 합주도 나온다(취소 버튼 없음).
- **초대 선택 화면(사용자 요청으로 교체)**: 예전 Roomin의 `InviteePicker` 구성을 참고해 이름 검색창 +
  높이가 고정된 스크롤 목록(동그란 이니셜·이름·선택 체크) + `N명 선택됨`으로 바꿨다. 회원이 13명이어도
  초대 영역이 약 300px로 고정된다(예전 2열 격자는 회원 수만큼 늘어났다). 예전 코드는 복사하지 않았고,
  파트 필드는 희나리에 없어 이름 검색만 둔다. 체크박스는 숨기되 키보드로 고를 수 있게 했다.
- **회원 프로필(사용자 요청)**: 예전 Roomin 프로필 편집을 참고해 내 정보에 `프로필 편집`을 추가했다.
  이름(실명 권장, 20자)·한줄소개(60자). 담당 세션(악기) 선택은 사용자 요청으로 제거했다. 같은 이름의
  회원이 있으면 동명이인 확인 후 저장. 처음 로그인 때만 Google 이름으로 만들고 이후 고친 값은 보존한다.
  앱 표시 이름·새 예약 작성자명·초대 알림에 프로필 이름이 쓰인다. 초대 목록은 이름으로 검색한다.
  프로필 사진은 파일 업로드 비목표라 넣지 않았다(이니셜 표시).
- **알림 켜기**: 내 정보 → 앱과 알림. 권한 요청 → 우리 SW로 FCM 토큰 → `members/{uid}/devices/{토큰 해시}`.
  아이폰 미설치·권한 거부·미지원·키 미설정을 구분해 안내. 지원 브라우저는 `홈 화면에 앱 설치` 버튼.
- **발송(Cloudflare Worker `notifier/`)**: 1분 cron. 초대 작업(`pushJobs`)을 문서 작성자·현재 참여자
  기준으로 다시 확인해 보내고 지운다. 1시간 안의 jam 예약·일정을 예약자+참여자에게 알리고
  `pushLog`로 중복을 막는다. 만료 토큰은 지운다. 서비스 계정 키는 Worker 비밀값으로만.
- **알림 클릭**: `/schedule?day=YYYY-MM-DD`로 열려 그 날짜가 선택된다.

## Firestore 변경 (배포 필요)

- `members/{uid}`: 검증 회원 읽기, 본인만 `{name, bio, updatedAt}` 쓰기(소개 ≤60), 삭제 금지
- `members/{uid}/devices/{id}`: 본인만 읽기·쓰기·삭제, `{token, updatedAt}`
- `reservations`·`events`: `participantIds`(≤20, 중복·작성자 금지), 작성자만 변경(참여자 빠지기 없음)
- `pushJobs`: 생성만. 같은 쓰기 이후 문서 존재·작성자 본인·대상 ⊆ 참여자(`getAfter`)
- `pushLog`: 클라이언트 접근 불가(기본 거부)
- 인덱스: `reservations(participantIds CONTAINS, startAt ASC)`

## 변경 파일

- 신규: `public/manifest.webmanifest`, `public/sw.js`, `public/icons/*`, `src/heenari/pwa/*`,
  `src/heenari/members/*`, `src/heenari/push/*`, `tests/pwa/sw.test.ts`, `notifier/*`,
  `docs/gates/HEENARI-FB-04-PWA-JAM-INVITES.md`
- 수정: `index.html`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`,
  `tests/firestore.rules.test.ts`, 예약·일정 저장소(참여자·초대 작업), 일정 모달·목록·보드,
  `ReservationList`, `pages.tsx`, `AuthContext.tsx`, `main.tsx`, `heenari.css`, `vitest.config.ts`,
  `package.json`(check:notifier), `.github/workflows/*`(VAPID 키 전달, CI에 Worker 타입 검사), `.env.example`,
  `AGENTS.md`, `AI_START_HERE.md`, `docs/heenari-lite-capability.md`
- 함께 들어간 FB-03 배포 기록 문서 갱신(운영 Rules 배포 완료 표기)

## 검증

- `npm run lint` 0 error · `npm run check:notifier` 통과
- `npm test` **287 tests** (담당 세션·빠지기 제거 후) · coverage Stmts 97.61% · Branches 93.56% · Funcs 97.27% · Lines 98.28%
- `npm run test:rules` **56 tests** (OpenJDK 21 로컬 에뮬레이터)
- `npm run build`·`check:bundle` 통과: 메인 160.0 KiB, Firestore 548.9 KiB·Messaging 27.3 KiB는 지연 로드
- 변이 확인(깨뜨리면 실패 → 복원 후 통과):
  - Rules: 초대 대상 ⊆ 참여자 조건 제거 → 1 fail (빠지기 권한은 이후 제거됨)
  - SW: `/__/` 제외 제거 → 1 fail
  - Worker: 작업 작성자 확인 제거 → 2 fail
- Worker 통합 테스트: 실제 RSA 키로 JWT 서명·검증, 가짜 Google·Firestore·FCM 서버에서
  토큰 1회 발급 → 초대 1건 → 리마인더 2건 → 작업 삭제까지 한 흐름으로 확인
- 브라우저: 배포 빌드에서 manifest 파싱·아이콘 3종 200 확인. 모바일 QA(360·390·430)에서
  가로 스크롤 없음, 초대 선택 44px 이상·2열, 초대됨·함께 표시, 강습 전환 시 초대 숨김

## 생략한 검증과 사유

- **서비스 워커 실제 등록**: 앱 안 브라우저 창은 SW 등록 자체를 지원하지 않는다(서버 응답은 정상이고
  한 줄짜리 SW도 같은 오류로 실패). 대신 실제 `sw.js`를 가짜 SW 전역에서 실행하는 테스트 7개로 설치·
  캐시·오프라인·`/__/` 제외·푸시·알림 클릭을 확인했다. 실기기 설치·푸시 수신은 운영 설정 후 확인 필요.
- **실제 FCM 발송·Cloudflare 배포**: 운영자 계정(서비스 계정 키, Cloudflare 로그인)이 필요해 하지 않았다.
- **iOS 실기기**: 홈 화면 설치·알림 권한·수신은 확인하지 못했다.

## 남은 리스크

- 알림 시각은 cron 1분 주기라 최대 약 1분 늦을 수 있다. Cloudflare cron은 드물게 건너뛸 수 있는데,
  리마인더는 1시간 창 안에서 다음 실행이 보낸다.
- 합주를 시작 1시간보다 가깝게 잡거나 시간을 바꾸면 곧바로(남은 분으로) 알림이 간다.
- 관리자가 남이 만든 일정에 회원을 추가하면 Rules상 초대 작업을 만들 수 없어 초대 알림이 가지 않는다
  (1시간 전 알림은 간다).
- 회원 명부에는 한 번 이상 로그인한 회원만 나온다.
- 초대 알림은 앱 안 알림함 없이 푸시로만 온다. 알림을 켜지 않은 회원은 목록의 `초대됨`으로만 안다.
- Firestore 무료 한도: cron만으로 하루 약 4,300 읽기(빈 조회 3회×1,440). 50,000 한도 안이다.

## 다음 handoff

1. `notifier/README.md` 순서대로: 웹 푸시 키 → GitHub 시크릿 `VITE_FIREBASE_VAPID_KEY` →
   알림 전용 서비스 계정 → `wrangler secret put` → `wrangler deploy`
2. 사용자 요청 시 커밋·PR → 병합(Hosting 자동 배포) → `npx -y firebase-tools@latest deploy --only firestore`
3. 실기기(안드로이드·아이폰 설치 앱)에서 알림 켜기 → 초대·1시간 전 알림 수신 확인 후 이 문서 갱신

## 배포 후 발생한 일과 조치 (2026-09-23)

- **Rules가 예전 버전으로 배포됨**: 첫 Firestore 배포가 `git pull` 전의 메인 폴더(PR #2 시점)에서 실행돼
  FB-02 시절 Rules와 인덱스 2개가 운영에 올라갔다. 증상은 내 정보 "예약을 불러오지 못했어요"(참여자
  인덱스 없음)였고, 태그·초대가 붙은 예약 저장도 거부됐을 가능성이 크다. 최신 `main`과 같은 폴더에서
  다시 배포해 인덱스 3개(참여자 인덱스 포함)를 확인했고, 메인 폴더도 `04c756a`로 빨리감기했다.
  재발 방지로 `AI_START_HERE.md` 배포 원칙에 "최신 main 폴더에서만 배포"를 추가했다.
- **휴대폰이 예전 페이지를 계속 사용**: Hosting 기본 캐시(`max-age=3600`) 때문에 웹 푸시 키를 넣은 재배포
  후에도 예전 페이지가 떠서 "알림 설정이 아직 준비되지 않았어요"가 보였다. 후속 PR에서 페이지는
  `no-cache`, 해시 코드 파일(`/assets/**`)은 1년 `immutable`로 바꾸고, 서비스 워커의 화면 이동 요청이
  브라우저 캐시를 거치지 않게(`cache: 'no-cache'`) 했으며 캐시 버전을 `heenari-v2`로 올렸다. 헤더는
  Hosting 에뮬레이터에서 경로별로 확인했다.

## 운영 확인 중 수정 (2026-09-24)

- **알림이 오지 않던 원인**: Worker 로그에서 매분 `SyntaxError: "undefined" is not valid JSON` 예외.
  `GOOGLE_SERVICE_ACCOUNT` 비밀값이 등록되지 않아(비밀값 목록 `[]`) `JSON.parse(undefined)`에서 멈췄다.
  파일을 표준 입력으로 넘겨(`wrangler secret put … < 파일.json`) 다시 등록한 뒤 10분간 매분 `ok` 확인.
- **예약 가능 시간 00:00–24:00**: 새벽에도 합주를 잡을 수 있게 운영 시작을 00:00으로 바꿨다. 하루 최대
  48칸(Rules `slotIds.size() <= 48`), 하루 안·30분 경계·합주 1시간 제한은 그대로. 48칸 전체 예약+슬롯
  배치가 Rules 문서 조회 한도 안에서 통과하는 것을 에뮬레이터로 확인.
- **iOS 모달 옆 넘침**: iOS 사파리의 날짜·시간 입력 자체 최소 폭 때문에 날짜칸이 모달보다 넓어져 옆으로
  밀렸다(사용자 스크린샷). 입력에 `min-width: 0; max-width: 100%`, 날짜·시간은 `appearance: none`과
  왼쪽 정렬, 모달 본문 `overflow-x: hidden`. 크롬에서 날짜칸에 420px 최소 폭을 주는 방식으로 증상을
  재현(고치기 전 모달 내용 폭 456px > 390px)하고, 고친 뒤 390px 안에 들어오는 것을 확인. iOS 실기기 확인 필요.

## 관련 커밋

- 아직 커밋하지 않았다.
- 기준: `5608751 Merge PR #3: HEENARI-FB-03 예약·일정 통합 화면과 태그`
