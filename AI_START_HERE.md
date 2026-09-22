# AI START HERE — 희나리

이 문서는 Codex, Claude Code, Gemini CLI, Cursor 등 어떤 AI 에이전트든 이
저장소에서 작업을 시작할 때 가장 먼저 읽어야 하는 진입점이다.

## 1. 문서 읽기 순서

1. `AI_START_HERE.md`
2. `AGENTS.md`
3. `docs/heenari-lite-capability.md`
4. `docs/gates/HEENARI-FB-02-RESERVATION.md`
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
- 푸시·이메일·문자 알림
- 여러 공간
- Google 외 인증 provider
- 회원 이메일 허용 목록
- PWA 설치·오프라인 캐시(별도 후속 게이트)

## 3. 현재 외부 상태

- Firebase project: `heenari-9f2a6`
- Firestore: `(default)`, Standard edition, `asia-northeast3`, free tier
- Hosting live URL: `https://heenari-9f2a6.web.app`
- 현재 배포물은 모바일 최적화 웹앱이며, 설치형 PWA manifest와 service worker는 아직 구현되지 않음
- Google Auth: 활성화 및 실제 로그인 확인 완료
- Authorized domains: `localhost`, `heenari-9f2a6.web.app`,
  `heenari-9f2a6.firebaseapp.com`
- 원격 Firestore Rules: 현재 저장소의 `firestore.rules`와 일치
- Firestore 쓰기: 현재 전부 거부됨
- Git origin: `https://github.com/liksn04/heenari.git`
- 이전 원격: `legacy-roomin`

원격 상태는 변할 수 있으므로 배포·Rules 변경 전 Firebase MCP 또는 공식 CLI로
반드시 재확인한다.

## 4. 중요한 Git 상태

현재 작업 트리에는 이전 Roomin/Supabase 저장소를 희나리 전용 저장소로 바꾸는
대규모 삭제와 새 파일이 아직 커밋되지 않은 상태로 함께 존재한다.

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
src/heenari/pages.tsx             현재 홈·예약·일정·내 정보 화면
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

활성 게이트는 `HEENARI-FB-02 30분 예약 엔진` 하나뿐이다.

구현 전에 반드시 읽을 문서:

- `docs/gates/HEENARI-FB-02-RESERVATION.md`

일정 CRUD, 관리자 권한, PWA 설치 기능은 이 게이트에 섞지 않는다.

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

현재 로컬에는 Java Runtime이 없을 수 있다. 이 경우 Rules 테스트를 생략한 채
완료했다고 주장하지 말고, Firebase MCP validator 결과와 미실행 사유를 기록한다.

UI 변경은 최소 360×800, 390×844, 430×932에서 확인한다.

## 9. 배포 원칙

- 사용자가 명시적으로 요청하지 않으면 live 배포하지 않는다.
- 배포 전 production build를 새로 생성한다.
- Firebase CLI는 `npx -y firebase-tools@latest` 형식을 사용한다.
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
