# AI START HERE — 희나리

이 문서는 Codex, Claude Code, Gemini CLI, Cursor 등 어떤 AI 에이전트든 이
저장소에서 작업을 시작할 때 가장 먼저 읽어야 하는 진입점이다.

## 1. 문서 읽기 순서

1. `AI_START_HERE.md`
2. `AGENTS.md`
3. `docs/heenari-lite-capability.md`
4. `docs/gates/HEENARI-FB-05-HOME-JAM-NOTICES.md`
5. 관련 소스와 테스트
6. `docs/*-closeout.md`는 완료 증거가 필요할 때만 확인

문서와 코드가 충돌하면 현재 코드와 원격 Firebase 상태를 먼저 확인하고 문서를
갱신한다. 오래된 가정을 조용히 유지하지 않는다.

## 2. 현재 제품

희나리는 40명 미만의 단일 동아리를 위한 모바일 우선 웹앱이다.

핵심 범위:

- Google 로그인
- PWA 재실행 시 로그인 상태 유지
- 하나의 공간에 대한 30분 고정 슬롯 예약
- 동아리 일정과 예약 확인

비목표:

- 멀티테넌시
- 회비·예산·회계
- 채팅·댓글
- 이메일·문자 알림(푸시는 FB-04의 합주 초대·1시간 전 알림만)
- 여러 공간
- Google 외 인증 provider
- 회원 이메일 허용 목록

## 3. 현재 외부 상태

- Firebase project: `heenari-9f2a6`
- Firestore: `(default)`, Standard edition, `asia-northeast3`, free tier
- Hosting live URL: `https://heenari-9f2a6.web.app`
- 현재 배포물은 설치형 PWA다. FB-04(PWA·합주 초대·알림)는 배포됐고 알림 Worker(`notifier/`)도
  운영 중이다(`docs/heenari-fb-04-closeout.md`). FB-05(홈 다음 합주·동아리 공지)도 배포됐다.
- Google Auth: 활성화 및 실제 로그인·예약 생성까지 프로덕션에서 확인 완료
- Authorized domains: `localhost`, `heenari-9f2a6.web.app`,
  `heenari-9f2a6.firebaseapp.com`
- **`VITE_FIREBASE_AUTH_DOMAIN`은 반드시 `heenari-9f2a6.web.app`이어야 한다.**
  앱이 `web.app`에서 서빙되므로 authDomain이 `firebaseapp.com`이면 교차 출처가 되고,
  브라우저의 서드파티 스토리지 차단 때문에 `signInWithRedirect` 결과를 읽지 못해
  아무 에러 없이 로그인 화면으로 되돌아온다.
- 위 authDomain과 짝으로, Google Cloud OAuth 2.0 클라이언트(`Web client (auto created
  by Google Service)`)의 **승인된 리디렉션 URI**에
  `https://heenari-9f2a6.web.app/__/auth/handler`가 등록돼 있어야 한다. 없으면 Google이
  `400 redirect_uri_mismatch`로 차단한다.
  콘솔: <https://console.cloud.google.com/apis/credentials?project=heenari-9f2a6>
- 위 두 값은 저장소에 없다. authDomain은 `.env.local`과 GitHub Actions 시크릿에,
  리디렉션 URI는 Google Cloud 콘솔에만 있다. 되돌리면 로그인이 조용히 깨지므로
  확인 없이 `firebaseapp.com`으로 바꾸지 않는다.
- 원격 Firestore Rules: 저장소 `firestore.rules`와 일치(2026-09-23 FB-03 머지 `5608751` 후
  `deploy --only firestore`로 배포, 컴파일 성공·release 확인).
- Firestore 쓰기: 예약과 슬롯은 본인 소유 문서에 한해 허용(HEENARI-FB-02 Rules 배포 완료).
  `settings` 쓰기는 계속 거부. `events`는 회원 본인 명의 생성, 작성자·관리자 수정·삭제.
  예약·일정 `tag`(jam·lesson·etc) 검증, 합주 예약 최대 2슬롯. `admins`는 Console에서만 쓴다.
- 배포된 복합 인덱스: `reservations(dayKey, startAt)`, `reservations(ownerId, startAt)`
- CI/CD: GitHub Actions. `main` 병합 시 Hosting 자동 배포, PR은 미리보기 채널 배포.
  Firestore Rules와 인덱스는 자동 배포에 **포함되지 않으므로**
  `npx -y firebase-tools@latest deploy --only firestore`로 따로 배포한다.
- Git origin: `https://github.com/liksn04/heenari.git`
- 이전 원격: `legacy-roomin`

원격 상태는 변할 수 있으므로 배포·Rules 변경 전 Firebase MCP 또는 공식 CLI로
반드시 재확인한다.

## 4. 중요한 Git 상태

이전 Roomin/Supabase 저장소를 희나리 전용 저장소로 바꾸는 대규모 삭제와 새 파일은
이미 커밋됐고(`2a31e4e`), HEENARI-FB-02 예약 엔진도 `main`에 병합됐다(`e62d4e1`).
"작업 트리에 미커밋 마이그레이션이 남아 있다"는 과거 가정은 더 이상 유효하지 않다.
아래 금지 사항은 계속 유효하다.

금지:

- `git reset --hard`
- `git checkout -- .`
- 삭제 파일 복원
- 사용자 확인 없는 stash, commit, force push
- `legacy-roomin` 내용을 현재 소스로 되살리기

작업 전 `git status --short --branch`를 확인하고 기존 변경을 그대로 보존한다.

## 5. 기술 구조

```text
src/App.tsx                       라우팅과 인증 진입
src/heenari/auth/                 Google Auth와 세션
src/heenari/lib/firebase.ts       Firebase 초기화
src/heenari/AppShell.tsx          모바일 앱 셸과 하단 내비게이션
src/heenari/pages.tsx             홈·일정(예약 통합)·내 정보 화면
src/heenari/schedule/             일정 화면, 통합 일정 모달(EntrySheet), 저장 방식 판단(entry.ts)
src/heenari.css                   디자인 토큰과 반응형 스타일
firestore.rules                   원격 데이터 보안 경계
firestore.indexes.json            재현 가능한 인덱스 정의
tests/firestore.rules.test.ts     Emulator Rules 테스트
```

의존성은 React, Firebase, React Router, Lucide로 제한한다. 새 상태관리나 UI
프레임워크를 추가하려면 기존 도구로 해결할 수 없는 이유가 있어야 한다.

## 6. 제품 불변조건

- 모바일 360–430px이 기본 표면이다.
- 터치 대상은 최소 44px이다.
- 입력 폰트는 최소 16px이다.
- 시간대는 `Asia/Seoul`이다.
- 예약은 30분 경계에 맞고 연속 슬롯만 허용한다.
- 동일 슬롯 문서는 하나만 존재한다.
- 예약과 슬롯 생성·삭제는 원자적이어야 한다.
- 화면에서 버튼을 숨기는 것은 보안 통제가 아니다.
- Firestore 권한은 Rules와 테스트가 함께 변경되어야 한다.
- 클라이언트 필드로 관리자 권한을 부여하지 않는다.

## 7. 활성 게이트

활성 게이트는 `HEENARI-FB-05 홈 다음 합주·동아리 공지` 하나뿐이다.
FB-02(예약 엔진), FB-03(예약·일정 통합, 태그), FB-04(PWA·합주 초대·알림)는 완료·배포됐다.

구현 전에 반드시 읽을 문서:

- `docs/gates/HEENARI-FB-05-HOME-JAM-NOTICES.md`

관리자 판정은 Firebase Console에서만 관리하는 `admins/{uid}` 문서로 한다. 알림 발송은
Cloudflare Worker(`notifier/`)가 맡고, 서비스 계정 키는 Worker 비밀값으로만 둔다.

## 8. 기본 검증

```bash
npm run lint
npm test
npm run test:coverage
npm run build
npm run check:bundle
git diff --check
```

Rules 변경 시:

```bash
npm run test:rules
```

로컬 Java는 Homebrew `openjdk@21`(keg-only)로 설치돼 있다. 실행 시
`PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH npm run test:rules`. 이 경로가 없다면 Rules 테스트를
생략한 채 완료했다고 주장하지 말고, Firebase MCP validator 결과와 미실행 사유를 기록한다.

UI 변경은 최소 360×800, 390×844, 430×932에서 확인한다.

## 9. 배포 원칙

- 사용자가 명시적으로 요청하지 않으면 live 배포하지 않는다.
- 배포 전 production build를 새로 생성한다.
- Firebase CLI는 `npx -y firebase-tools@latest` 형식을 사용한다.
- `deploy --only firestore`는 **최신 `main`과 같은 폴더에서만** 실행한다. 오래된 폴더에서 배포하면
  예전 Rules·인덱스가 운영에 올라간다(2026-09-23 실제로 발생, 재배포로 복구). 실행 전
  `git log --oneline -1`이 `origin/main`과 같은지 확인한다.
- 실제 Firebase 설정은 `.env.local`에만 두고 커밋하지 않는다.
- Rules 배포 후 원격 Rules를 다시 읽어 로컬과 일치하는지 확인한다.

## 10. 작업 종료 형식

각 게이트 종료 시 `docs/<gate>-closeout.md`를 만들거나 갱신한다.

```markdown
## 결과
## 변경 파일
## 검증
## 생략한 검증과 사유
## 남은 리스크
## 다음 handoff
## 관련 커밋
```

검증되지 않은 항목과 외부 차단 요소를 숨기지 않는다.
