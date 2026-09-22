# HEENARI-FB-01 closeout

## 결과

- 희나리 Lite 제품·기술 계약을 작성했다.
- 기존 진입점을 희나리 전용 Firebase 인증 셸로 교체했다.
- Google 로그인과 검증된 이메일 확인 흐름을 구현했다.
- `로그인 상태 유지` 선택에 따라 Firebase LOCAL 또는 SESSION persistence를 적용한다.
- 보호 데이터는 기본 쓰기 거부인 Firestore Rules를 추가했다.
- 공식 희나리 로고 원본의 크림, 적색, 오렌지, 시안 토큰으로 UI를 재설계했다.
- 홈, 예약, 일정, 내 정보의 모바일 우선 셸을 만들었다.
- 320px 최소 폭, 44px 터치 영역, 16px 입력, safe-area와 터치 전용 상태를 모바일 계약으로 고정했다.

## 변경 파일

- 제품 계약: `docs/heenari-lite-capability.md`
- 앱 진입점: `src/App.tsx`, `src/main.tsx`
- 희나리 런타임: `src/heenari/`, `src/heenari.css`
- Firebase: `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.env.example`
- 브랜드 원본: `public/heenari-logo.jpeg`
- 검증: `vitest.config.ts`, `vitest.rules.config.ts`, `tests/firestore.rules.test.ts`

## 검증

- `npm run lint`: 통과
- `npm test`: 14 files, 79 tests 통과
- `npm run test:coverage`: statements 94.54%, branches 80.64%, functions 100%, lines 94.23%
- `npm run build`: 통과
- `npm run check:bundle`: 통과
- `npm audit --omit=dev --audit-level=high`: production dependencies 취약점 0건
- `git diff --check`: 통과
- Playwright 데스크톱 1200x900 로그인 화면 확인
- Playwright 모바일 360x800, 390x844, 430x932 로그인 화면 확인
- `로그인 상태 유지` 기본 선택과 SESSION 전환 UI 테스트 통과
- Google 로그인 CTA의 브라우저 동작 확인

## 생략한 검증과 사유

- `npm run test:rules`: 로컬 Java Runtime이 없어 Firestore Emulator를 시작하지 못했다.
- 실제 Google OAuth 완료: 사용자 상호작용이 필요한 리디렉션 로그인이라 자동화하지 않았다.
- 인증된 앱 셸 브라우저 QA: 같은 이유로 정적 UI 테스트만 수행했다.
- 전체 `npm audit`: Firebase CLI 개발 의존성에 잔여 취약점이 있다. 배포 번들에는 포함되지 않으며 production audit은 통과했다.

## 남은 리스크

- Emulator Rules 테스트는 작성됐지만 아직 실행 증거가 없다.
- 기존 Roomin/Supabase 소스는 다음 교체 게이트까지 저장소에 남아 있다.
- 공식 로고 JPEG는 원본 충실도를 위해 그대로 사용한다. 향후 디자이너가 제공하는 투명 PNG/SVG가 있으면 교체하는 편이 좋다.

## 다음 handoff

1. Java Runtime을 준비하고 `npm run test:rules`를 실행한다.
2. Firebase 프로젝트 값으로 `.env.local`을 구성한다.
3. Google 로그인 성공과 보호 라우트 브라우저 QA를 완료한다.
4. 검증 후 `HEENARI-FB-02` 30분 예약 엔진을 시작한다.

## 관련 커밋

- 아직 커밋하지 않음
