# 희나리 저장소 전환 closeout

## 결과

- 새 GitHub 저장소 `https://github.com/liksn04/heenari.git`을 `origin`으로 연결했다.
- 이전 `sos-reservaiton` 원격은 복구용 `legacy-roomin`으로 보존했다.
- 현재 `main` 브랜치의 이전 upstream 연결을 해제했다.
- Roomin, Supabase, Vercel, Tailwind, 과거 법적 문서와 분석 산출물을 제거했다.
- 희나리 앱에 필요한 React, Firebase, 테스트 의존성만 남겼다.
- Pretendard는 실제 사용하는 400, 600, 800 세 굵기만 남겼다.
- README와 AGENTS 문서를 희나리 기준으로 교체했다.

## 남긴 범위

- 희나리 React 앱과 모바일 디자인 시스템
- Firebase Auth, Firestore 설정과 Security Rules
- 희나리 공식 로고
- 제품·기술 설계와 현재 게이트 closeout
- 단위/UI 테스트와 Firestore Rules 테스트
- 빌드·번들 검사 스크립트

## 검증

- `npm run lint`: 통과
- `npm test`: 2 files, 15 tests 통과
- `npm run test:coverage`: statements 94.54%, branches 80.64%, functions 100%, lines 94.23%
- `npm run build`: 통과
- `npm run check:bundle`: 통과
- `npm audit --omit=dev --audit-level=high`: production dependencies 취약점 0건
- 활성 소스에서 Roomin, 빛소리, Supabase 참조 0건
- `git diff --check`: 통과

## 생략한 검증과 사유

- `npm run test:rules`: Java Runtime 부재로 Firestore Emulator 실행 불가
- 원격 push: 사용자가 push를 요청하지 않아 수행하지 않음

## 복구 정보

- 이전 원격: `legacy-roomin -> https://github.com/liksn04/sos-reservaiton.git`
- 생성 산출물은 `/Users/liksn04/.Trash/heenari-cleanup-20260922/`로 이동했다.
- 이전 Git 이력은 현재 로컬 저장소와 `legacy-roomin` 원격에 남아 있다.

## 다음 handoff

1. 현재 정리 상태를 검토한다.
2. 새 저장소를 완전히 새 이력으로 시작할지, 기존 이력을 유지할지 결정한다.
3. 결정 후 초기 커밋과 `origin/main` push를 수행한다.
4. Firebase 실제 프로젝트를 연결해 인증 게이트를 닫는다.

## 관련 커밋

- 아직 커밋하지 않음
