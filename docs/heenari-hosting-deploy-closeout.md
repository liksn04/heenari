# 희나리 Firebase Hosting 배포 closeout

## 결과

- 희나리 Vite 프로덕션 빌드를 Firebase Hosting live 채널에 배포했다.
- Live URL: `https://heenari-9f2a6.web.app`
- Firebase 기본 보조 URL: `https://heenari-9f2a6.firebaseapp.com`
- SPA fallback은 모든 경로를 `index.html`로 전달한다.

## 배포 경로

- Firebase MCP Hosting deploy는 로그 없이 즉시 실패했다.
- 원격 변경이 적용되지 않은 것을 확인한 뒤 공식 CLI 경로인
  `npx -y firebase-tools@latest deploy --only hosting --project heenari-9f2a6`
  로 동일한 Hosting 대상만 재실행했다.
- CLI 배포는 10개 파일 업로드, 버전 finalize, live release까지 성공했다.

## 검증

- `npm run lint`: 통과
- `npm test`: 2 files, 14 tests 통과
- `npm run build`: 통과
- `npm run check:bundle`: 통과
- `git diff --check`: 통과
- Live URL 390×844 모바일 렌더링 확인
- Live URL에서 Google OAuth handler redirect 확인
- Live URL에서 Google 로그인과 앱 셸 진입: 사용자 확인 완료

## 생략한 검증과 사유

- PWA를 완전히 종료한 뒤 세션 복원은 아직 별도 확인 필요

## 다음 handoff

Google 로그인과 홈 진입이 확인됐다. 다음 구현 게이트는 30분 예약 엔진이며, PWA 재실행 세션 복원은 병행 QA로 남긴다.

## 관련 커밋

- 아직 커밋하지 않음
