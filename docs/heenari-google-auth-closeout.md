# 희나리 Google 인증 전환 closeout

## 결과

- Firebase MCP를 `heenari-9f2a6` 프로젝트와 현재 작업 폴더에 연결했다.
- Firebase Web App SDK 설정을 MCP에서 재확인했다.
- Email/Password와 Anonymous provider를 끄고 Google provider를 활성화했다.
- OAuth 브랜드 이름을 `희나리`, 지원 이메일을 `liksn04@gmail.com`으로 설정했다.
- `localhost`, `heenari-9f2a6.web.app`, `heenari-9f2a6.firebaseapp.com`을 Authorized Domains로 배포했다.
- Firestore `(default)` 데이터베이스를 Standard edition, Seoul `asia-northeast3`에 생성했다.
- 생성된 데이터베이스는 free tier와 realtime updates가 활성화되어 있다.
- 로컬 `firestore.rules`와 빈 인덱스 구성을 원격에 배포했다.
- 이메일 허용 목록과 `members/{uid}` 선행 조건을 제거했다.
- 검증된 Google 계정은 모두 일반 회원으로 앱에 진입한다.
- `로그인 상태 유지`의 LOCAL/SESSION 선택을 Google redirect 로그인에도 유지했다.

## 변경 파일

- `firebase.json`, `.firebaserc`
- `src/heenari/auth/AuthContext.tsx`
- `src/heenari/auth/authState.ts`
- `src/heenari/auth/access.ts`
- `src/heenari/Login.tsx`
- `firestore.rules`
- `tests/firestore.rules.test.ts`
- 제품 계약, README, AGENTS 문서

## 검증

- Firebase MCP Auth deploy: 성공
- Firebase MCP Rules validation: 문법 오류 없음
- Firebase MCP Firestore deploy: 성공
- 원격 Rules와 로컬 Rules 일치 확인
- 실제 `localhost` Google OAuth handler redirect: 성공
- Live URL에서 Google 계정 선택·인증·보호 앱 진입: 사용자 확인 완료
- `npm run lint`: 통과
- `npm test`: 2 files, 14 tests 통과
- `npm run test:coverage`: statements 100%, branches 92.59%, functions 100%, lines 100%
- `npm run build`: 통과
- `npm run check:bundle`: 통과
- `npm audit --omit=dev --audit-level=high`: production dependencies 취약점 0건
- `git diff --check`: 통과

## Security Rules audit

```json
{
  "score": 5,
  "summary": "현재 Gate 1 Rules는 검증된 Google 사용자에게 읽기만 허용하고 모든 쓰기를 거부하며 기본 거부 규칙을 유지한다.",
  "findings": []
}
```

- Update bypass: 모든 쓰기가 거부되어 없음
- Authority source: 클라이언트 필드가 아니라 Firebase Auth token 사용
- Resource exhaustion: 클라이언트 쓰기가 없어 현재 게이트에는 해당 없음
- Type safety: 쓰기 활성화 전 Gate 2에서 필드 타입·크기 검증 필요
- Identity check: `email_verified`와 `google.com` provider를 모두 요구

## 생략한 검증과 사유

- `npm run test:rules`: 로컬 Java Runtime이 없어 Emulator 실행 불가
- 관리자 권한 부여 방식은 일정 관리 게이트 전에 별도 결정 필요
- PWA를 완전히 종료한 뒤 세션 복원: 아직 별도 확인 필요

## 다음 handoff

Google 로그인과 보호 라우트 진입이 확인됐으므로 `HEENARI-FB-02` 30분 예약 엔진 게이트를 시작할 수 있다. PWA 세션 복원은 병행 QA 항목으로 남긴다.

## 관련 커밋

- 아직 커밋하지 않음
