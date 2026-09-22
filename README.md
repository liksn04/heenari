# 희나리

40명 미만의 희나리 동아리원을 위한 모바일 우선 공간 예약·일정 서비스입니다.

AI 에이전트로 작업할 때는 [AI_START_HERE.md](./AI_START_HERE.md)를 가장 먼저
읽어주세요.

## 핵심 범위

- Firebase Google 로그인
- PWA 재실행 후 로그인 상태 유지
- 30분 고정 슬롯 기반 공간 예약
- 동아리 일정과 예약 통합 조회
- 검증된 Google 계정 기반 보호 라우트

## 기술 스택

- Vite, React 19, TypeScript
- Firebase Authentication, Cloud Firestore, Hosting
- Vitest, Testing Library, Firebase Emulator Suite

## 시작하기

```bash
npm install
cp .env.example .env.local
npm run dev
```

Firebase Web App 설정값은 `.env.local`에 입력합니다. 실제 환경 변수는 Git에
커밋하지 않습니다.

## 검증

```bash
npm run lint
npm test
npm run test:coverage
npm run build
npm run check:bundle
npm run test:rules
```

`test:rules`는 로컬 Java Runtime이 필요합니다.

## 제품 계약

- [희나리 Lite 제품·기술 설계](./docs/heenari-lite-capability.md)
- [Firebase 앱 기반 closeout](./docs/heenari-fb-01-closeout.md)
