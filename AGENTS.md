# HEENARI PROJECT GUIDE

모든 AI 에이전트는 작업 전에 루트 `AI_START_HERE.md`를 먼저 읽는다.

## Product

희나리는 40명 미만의 단일 동아리를 위한 모바일 우선 예약·일정 앱이다.
로그인, 30분 공간 예약, 일정 확인만 핵심 범위로 유지한다.

## Architecture

- `src/heenari/`: 앱 셸, 인증, 화면, Firebase 클라이언트
- `src/heenari.css`: 희나리 디자인 토큰과 반응형 스타일
- `firestore.rules`: 데이터 접근 권한의 최종 보안 경계
- `tests/firestore.rules.test.ts`: Emulator 기반 Rules 검증
- `docs/heenari-lite-capability.md`: 제품·기술 source of truth
- `docs/gates/HEENARI-FB-04-PWA-JAM-INVITES.md`: 현재 활성 구현 게이트
- `notifier/`: 푸시 발송 Cloudflare Worker(합주 초대·1시간 전 알림)

## Rules

- 모바일 360–430px을 기본 제품 표면으로 설계한다.
- 터치 대상은 최소 44px, 입력은 최소 16px을 유지한다.
- Google 로그인만 사용하며 별도 이메일 허용 목록은 두지 않는다.
- 인증 토큰을 직접 저장하지 않고 Firebase Auth persistence를 사용한다.
- Firestore 쓰기는 Rules와 테스트 없이 추가하지 않는다.
- 예약은 30분 경계와 원자적 슬롯 잠금을 지켜야 한다.
- Firebase 설정값과 실제 계정 정보는 커밋하지 않는다.
- 범용화, 멀티테넌시, 회계·채팅 기능을 추측해서 추가하지 않는다. 알림은 FB-04에서 정한 합주
  초대·1시간 전 푸시만 둔다.
- 서비스 계정 키는 저장소·클라이언트에 두지 않는다(Worker 비밀값으로만).

## Validation

```bash
npm run lint
npm test
npm run test:coverage
npm run build
npm run check:bundle
```

Rules 변경 시 Java Runtime이 있는 환경에서 `npm run test:rules`도 실행한다.

## Active Gate

현재 활성 게이트는 `HEENARI-FB-04 PWA·합주 초대·알림` 하나다. 알림 발송은 Cloudflare
Worker(`notifier/`)가 맡고 Firebase는 Spark 요금제를 유지한다. 관리자의 타인 예약 정리는
섞지 않는다. live 배포와 commit/push는 별도 요청 없이는 수행하지 않는다.
