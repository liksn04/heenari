# 희나리 Lite 제품·기술 설계

상태: 구현 준비안
작성일: 2026-09-22
대상: 40명 미만의 단일 동아리 `희나리`

현재 활성 구현 게이트: `docs/gates/HEENARI-FB-03-SCHEDULE.md`

## 1. Capability

사용자는 별도 가입 절차 없이 검증된 Google 계정으로 로그인하고, 하나의
동아리 공간을 30분 단위로 예약하며, 예약과 동아리 일정을 한 화면에서 확인할
수 있다. 초기 버전은 운영 편의를 위해 별도 이메일 허용 목록을 사용하지 않는다.

이 프로젝트는 기존 Roomin의 리브랜딩이나 백엔드 마이그레이션이 아니다.
기존 저장소의 Git 이력은 보존하되, 런타임은 희나리 전용 Firebase 앱으로
교체한다.

## 2. 제품 원칙

1. 희나리 한 동아리만 지원한다.
2. 핵심 동작은 로그인, 예약, 일정 확인 세 가지다.
3. 회원이 설명 없이 모바일에서 사용할 수 있어야 한다.
4. 운영 빈도가 낮은 기능은 앱에 만들지 않고 Firebase Console로 처리한다.
5. 예약 충돌과 권한 검증은 화면 상태가 아니라 데이터 계층에서 보장한다.
6. 향후 가능성을 이유로 멀티테넌시나 범용 설정 시스템을 만들지 않는다.

## 3. 사용자와 권한

### 회원

- Google 계정으로 로그인한다.
- 검증된 Google 이메일을 가진 사용자는 앱을 사용한다.
- 전체 예약과 동아리 일정을 조회한다.
- 하나의 `일정 추가` 모달로 일정을 등록한다. 장소가 동아리방이고 시간을 지정하면
  30분 슬롯을 잠그는 예약으로, 그 밖은 잠그지 않는 일정으로 저장된다(2026-09-23 통합).
- 자신이 만든 미래 예약과 자신이 만든 일정을 수정하거나 삭제한다.
- 지난 예약은 조회만 한다.

### 관리자(후속 게이트)

- 회원이 할 수 있는 모든 작업을 수행한다.
- 모든 예약을 수정하거나 취소한다.
- 누가 만들었든 모든 일정을 수정, 삭제한다(타인 예약 정리는 아직 미구현).
- 관리자 권한은 Firebase Console에서만 관리하는 `admins/{uid}` 문서로 부여한다
  (2026-09-23 확정, `docs/gates/HEENARI-FB-03-SCHEDULE.md`).

### 비회원

- Google 로그인 화면만 사용할 수 있다.
- 예약, 일정, 회원 정보에 접근할 수 없다.

## 4. 고정 정책과 제안 기본값

### 확정된 정책

- 예약 시작과 종료는 30분 경계에 맞아야 한다.
- 겹치는 슬롯은 동시에 두 예약이 점유할 수 없다.
- 별도 이메일 허용 목록은 제공하지 않는다.
- 인증은 Firebase Authentication Google provider만 사용한다.
- 시간대는 `Asia/Seoul`로 고정한다.
- 공간은 하나만 존재한다.

### 구현 기본값

아래 값은 실제 동아리 규칙이 정해질 때까지 사용하는 기본값이다.

- 예약 가능 시간: 09:00–24:00
- 최소 예약: 30분
- 태그: `합주 / 강습 / 기타` 중 하나. 합주만 최대 1시간, 강습·기타는 운영 시간 안에서 길이 제한 없음
  (2026-09-23 사용자 결정, 이전 기본값 "최대 4시간"을 대체)
- 예약 가능 기간: 오늘부터 60일
- 시작 이후 예약 수정·취소 불가
- 관리자는 위 제한과 관계없이 예약을 정리할 수 있음

초기 버전에는 이 값을 수정하는 관리자 UI를 만들지 않는다. 하나의 타입이
있는 설정 문서 또는 코드 상수로 관리한다.

## 5. 핵심 사용자 흐름

### 로그인

1. 사용자가 `Google로 계속하기`를 선택한다.
2. `로그인 상태 유지`가 선택되어 있으면 Firebase `LOCAL`, 해제되어 있으면
   `SESSION` persistence를 로그인 전에 적용한다.
3. Firebase Authentication이 Google 계정과 이메일 검증 상태를 확인한다.
4. 검증된 Google 계정이면 홈으로 이동한다.
5. 다른 provider 또는 검증되지 않은 계정은 로그아웃시키고 안내를 표시한다.

`로그인 상태 유지`는 기본 선택이다. 선택 상태에서는 PWA나 브라우저를 닫았다가
다시 열어도 Firebase 세션을 복원한다. 해제 상태에서는 현재 브라우저 세션이
끝날 때 인증 상태가 종료된다. 앱은 인증 토큰을 별도 localStorage 키로 복제하지
않고 Firebase Authentication persistence만 사용한다.

### 예약 생성

1. 사용자가 날짜를 선택한다.
2. 앱이 30분 단위 슬롯과 현재 점유 상태를 표시한다.
3. 사용자가 연속된 슬롯과 예약 제목을 선택한다.
4. 클라이언트가 선택 슬롯을 Firestore 트랜잭션에서 다시 읽는다.
5. 하나라도 점유 중이면 전체 작업을 실패시키고 최신 상태를 다시 표시한다.
6. 모두 비어 있으면 예약 문서와 슬롯 잠금 문서를 한 트랜잭션으로 생성한다.

### 예약 수정

시간을 바꾸지 않는 제목·메모 수정은 예약 문서만 갱신한다. 시간 변경은 기존
슬롯 해제와 새 슬롯 획득을 하나의 트랜잭션으로 수행한다. 실패하면 기존 예약은
그대로 유지한다.

### 예약 취소

예약 문서에 기록된 `slotIds`를 읽고 예약과 슬롯 문서를 한 트랜잭션으로
삭제한다. 일부 슬롯만 남거나 일부만 삭제된 상태를 허용하지 않는다.

### 일정 확인

홈에서는 다음 일정과 내 다음 동아리방 시간을 각각 한 건씩 보여준다. 일정 화면은
선택한 날짜의 예약과 일정을 구분 없이 시간순 한 목록으로 보여준다(필터 없음).

## 6. 화면 구조

```text
/login
  희나리 로고와 한 줄 소개
  로그인 상태 유지
  Google로 계속하기

/
  오늘 날짜와 회원 이름
  다음 동아리 일정
  다음 공간 예약
  빠른 예약 버튼(→ /schedule)
  오늘 일정 요약

/schedule  (예약·일정 통합 화면, /reserve는 여기로 리디렉트)
  월간 날짜 선택기
  일정 추가 버튼 하나 → 일정 모달(제목·장소[동아리방/다른 장소]·종일·시작·종료·설명)
  선택일 타임라인(구분 없는 한 목록, 장소·작성자·`내 일정` 표시)
    내 미래 예약·내 일정(관리자는 모든 일정) → 같은 모달로 수정·삭제

/me
  내 예정 예약
  지난 예약
  로그아웃
```

하단 내비게이션은 `홈 / 일정 / 내 정보` 세 항목으로 고정한다(2026-09-23 사용자 요청으로
예약과 일정을 하나로 통합).

## 7. 시각 방향

희나리는 범용 SaaS가 아니라 작은 동아리의 공동 공간처럼 보여야 한다. 공식
로고의 손그림 악기와 붓 터치가 시각 시스템의 기준이다.

- 이름: `희나리`
- 로고 원본: `public/heenari-logo.jpeg`
- 톤: 생동감 있고 친근하며 손으로 만든 공연 포스터 같은 분위기
- 배경: 로고 원본의 따뜻한 크림
- 주조색: 선명한 적색
- 보조색: 기타의 오렌지와 장식의 시안
- 레이아웃: 모바일 우선, 카드 수를 줄이고 시간과 상태를 크게 표현
- 항목 상태: 색상만이 아니라 `내 일정`, 장소 텍스트 병기
- 애니메이션: 화면 전환보다 예약 성공·실패 피드백에만 제한적으로 사용
- 다크 모드: 초기 버전 비목표. 하나의 완성도 높은 라이트 테마를 우선한다.
- 히어로: 광고 문구 대신 다음 행동과 일정을 바로 보여주는 운영형 홈

로고는 비율, 색, 붓 터치와 기타 형태를 재해석하지 않고 제공된 원본을 그대로
사용한다. 작은 UI에서는 원본 이미지를 크롭한 엠블럼과 `희나리` 텍스트를 함께
사용한다.

### 모바일 제품 계약

회원의 주 사용 환경은 PC가 아니라 모바일이다. 모바일은 축소된 데스크톱
화면이 아니라 기본 제품 표면이며, 데스크톱은 같은 흐름을 넓게 보여주는 보조
환경으로 취급한다.

- 주 검증 폭: 360px, 390px, 430px
- 최소 지원 폭: 320px
- 주요 터치 대상: 최소 44×44px
- 입력 글자 크기: 최소 16px로 iOS 자동 확대 방지
- 하단 내비게이션: 엄지손가락으로 접근 가능한 세 항목 고정
- 상단과 하단: iPhone safe-area inset 반영
- 예약 선택: 작은 화면에서 한 열의 30분 슬롯 목록 사용
- 일정 기본 보기: 조밀한 월간 표보다 선택 날짜의 세로 타임라인을 우선
- 핵심 CTA: 키보드가 열린 상태에서도 스크롤로 접근 가능해야 함
- 상호작용: hover에 의존하지 않으며 터치와 키보드 모두 지원
- 상태 구분: 색상 외에 텍스트와 아이콘을 함께 사용
- 화면 회전: 세로 모드를 우선하되 가로 모드에서 기능이 잘리지 않아야 함

모바일 UI 변경의 완료 기준은 360×800, 390×844, 430×932에서 가로 스크롤이
없고, 입력·CTA·하단 내비게이션이 서로 겹치지 않는 것이다.

## 8. Firebase 아키텍처

### 사용 서비스

- Firebase Authentication: Google 계정 인증
- Cloud Firestore: 예약, 슬롯 잠금, 동아리 일정
- Firebase Hosting: Vite 정적 빌드 배포
- Firebase Emulator Suite: Auth, Firestore, Security Rules 검증

### 초기 버전에서 사용하지 않는 서비스

- Cloud Functions
- Cloud Storage
- Cloud Messaging
- Realtime Database
- Firebase App Hosting
- Analytics 및 Crashlytics

모든 검증된 Google 계정은 일반 회원이다. 관리자 권한은 클라이언트 입력에 맡기지
않고, Console에서만 쓸 수 있는 `admins/{uid}` 문서의 존재로 Rules가 판정한다.

## 9. Firestore 데이터 모델

### `reservations/{reservationId}`

```ts
interface Reservation {
  title: string;
  note: string | null;
  ownerId: string;
  ownerName: string;
  startAt: Timestamp;
  endAt: Timestamp;
  dayKey: string;      // YYYY-MM-DD, Asia/Seoul
  slotIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

`ownerName`은 목록 표시를 위한 스냅샷이다. 권한 판단에는 항상 `ownerId`를
사용한다.

### `reservationSlots/{slotId}`

```ts
interface ReservationSlot {
  reservationId: string;
  ownerId: string;
  dayKey: string;
  startsAt: Timestamp;
  createdAt: Timestamp;
}
```

슬롯 ID는 `YYYY-MM-DD_HH-mm` 형식이다. 공간이 하나이므로 별도 공간 ID를
두지 않는다. 슬롯 문서는 생성 이후 갱신하지 않고 예약 취소 시 삭제한다.

### `events/{eventId}`

```ts
interface ClubEvent {
  title: string;
  description: string | null;
  location: string | null;
  startAt: Timestamp;
  endAt: Timestamp | null;
  allDay: boolean;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `settings/club`

```ts
interface ClubSettings {
  name: '희나리';
  timezone: 'Asia/Seoul';
  slotMinutes: 30;
  openingTime: string;
  closingTime: string;
  maxReservationSlots: number;
  bookingWindowDays: number;
}
```

### `admins/{uid}`

Firebase Console에서만 만들고 지운다. 문서 존재 자체가 관리자 판정이며 필드는
운영 메모(`name`, `createdAt`)일 뿐 권한 근거가 아니다. 클라이언트 쓰기는 항상
거부하고, 회원은 자기 문서만 읽을 수 있다.

## 10. 데이터 불변조건

1. 예약의 `startAt`과 `endAt`은 30분 경계에 맞는다.
2. `endAt`은 `startAt`보다 늦다.
3. 예약의 슬롯은 빈틈없이 연속된다.
4. `slotIds.length`는 예약 길이와 일치한다.
5. 같은 `slotId` 문서는 하나만 존재한다.
6. 예약 생성과 슬롯 생성은 모두 성공하거나 모두 실패한다.
7. 예약 삭제와 슬롯 삭제는 모두 성공하거나 모두 실패한다.
8. 회원은 다른 회원의 예약 소유권을 가져올 수 없다.
9. 검증되지 않은 이메일과 Google 이외 provider는 읽기와 쓰기를 할 수 없다.
10. 클라이언트가 전달한 표시 이름이나 역할을 권한 근거로 사용하지 않는다.

## 11. Security Rules 계약

- 모든 보호 데이터는 `request.auth != null`을 요구한다.
- `request.auth.token.email_verified == true`를 요구한다.
- Google provider로 인증된 사용자만 예약과 일정을 읽을 수 있다.
- 일반 회원은 `ownerId == request.auth.uid`인 예약만 생성한다.
- 일반 회원은 자기 미래 예약만 수정·삭제한다.
- 예약의 `ownerId`, `createdAt`은 수정할 수 없다.
- 슬롯 생성자는 대응 예약의 소유자와 같아야 한다.
- 슬롯 문서는 수정할 수 없고 생성 또는 삭제만 가능하다.
- 일정(`events`)은 모든 회원이 본인 명의로 만들고, 수정·삭제는 작성자 또는
  관리자(`admins/{uid}` 존재)만 한다.
- 기본 규칙은 모든 접근 거부다.

Rules만으로 표현하기 어려운 예약 불변조건은 트랜잭션 구현과 Emulator 기반
통합 테스트를 함께 사용한다. 화면에서 버튼을 숨기는 것은 보안 통제가 아니다.

## 12. 쿼리 계약과 인덱스

- 날짜별 예약: `dayKey == 선택일`, `startAt asc`
- 내 예정 예약: `ownerId == uid`, `startAt >= now`, `startAt asc`
- 기간별 동아리 일정: `startAt >= 시작`, `startAt < 종료`, `startAt asc`
- 관리자 예약 조회도 날짜 범위 쿼리를 기본으로 한다.

Firestore가 요청하는 복합 인덱스는 `firestore.indexes.json`에 저장해 재현
가능하게 관리한다. 전체 컬렉션을 내려받아 클라이언트에서 필터링하지 않는다.

## 13. 오류와 복구

- 로그인 실패: OAuth 내부 정보를 노출하지 않는 일반 메시지
- Google 이외 provider 또는 검증되지 않은 계정: 즉시 로그아웃
- 슬롯 충돌: 선택 상태를 해제하지 않고 충돌 슬롯만 최신화
- 네트워크 실패: 예약 성공으로 낙관 표시하지 않음
- 트랜잭션 실패: 예약과 슬롯 중 일부가 생성되지 않았음을 보장
- 설정 문서 누락: 앱 부팅 실패 대신 빌드 기본값으로 동작하고 운영 경고 기록
- 권한 거부: 사용자 메시지와 개발자용 로그를 분리

오프라인 예약 생성은 지원하지 않는다. 온라인 연결이 확인된 상태에서만 예약
확정 버튼을 활성화한다.

## 14. 비목표

- Google 이외 소셜 로그인과 이메일·비밀번호 로그인
- 여러 동아리 또는 여러 공간
- 회비, 예산, 영수증, 회계
- 행사 참가 신청과 출석 체크
- 푸시, 이메일, 문자 알림
- 채팅과 댓글
- 파일 및 이미지 업로드
- 실시간 접속 상태 표시
- 복잡한 통계와 대시보드
- 운영진용 회원 계정 생성 UI
- 반복 예약
- 대기열과 예약 승인제
- 기존 Supabase 데이터 자동 이전

## 15. 저장소 교체 전략

1. 현재 상태에 태그 또는 기준 커밋을 남겨 기존 Roomin 구현을 복구 가능하게 한다.
2. 희나리 Lite 전용 작업 브랜치를 만든다.
3. 기존 런타임과 Supabase 코드는 새 앱이 기능적으로 검증된 뒤 제거한다.
4. 로고나 일부 순수 UI 자산 외에는 기존 도메인 코드를 복사하지 않는다.
5. Supabase 환경 변수, 마이그레이션, Edge Functions와 관련 패키지를 제거한다.
6. Firebase 설정은 `.env.local`로 주입하고 실제 값은 커밋하지 않는다.
7. README와 AGENTS 문서는 새 구조가 동작한 뒤 갱신한다.

운영 데이터 이관은 기본적으로 비목표다. 이 저장소의 기존 Supabase가 실제
희나리 운영 데이터를 포함한다면 별도 데이터 이관 게이트를 먼저 추가해야 한다.

## 16. 구현 순서

### Gate 1 — Firebase 앱 기반

목표: 희나리 브랜드 셸, Firebase 초기화, Google 로그인, 보호 라우트를 만든다.

검증:

- Emulator에서 로그인 성공·실패
- 비로그인 사용자의 보호 라우트 차단
- Google 이외 provider와 검증되지 않은 이메일 차단
- 새로고침 후 세션 복구
- 모바일 로그인과 홈 셸 수동 확인

### Gate 2 — 30분 예약 엔진

목표: 날짜별 슬롯 조회와 원자적 생성·수정·취소를 구현한다.

검증:

- 30분 경계 이외 입력 거부
- 동시 예약 중 정확히 하나만 성공
- 여러 슬롯 생성 중 실패 시 부분 데이터 없음
- 자신의 예약과 관리자 권한 검증
- 과거 예약 수정·취소 거부

### Gate 3 — 일정과 통합 홈

목표: 관리자 일정 CRUD와 회원용 통합 일정 화면을 구현한다.

검증:

- 회원은 일정 읽기만 가능
- 관리자는 일정 CRUD 가능
- 선택 날짜에서 예약과 일정의 정렬이 정확함
- 홈의 다음 항목 계산이 정확함

### Gate 4 — 출시 준비

목표: 기존 런타임 제거, 브랜드 자산 확정, Hosting 배포 준비를 완료한다.

검증:

- 이전 브랜드와 Supabase 활성 참조 0건
- 테스트, 린트, 타입 검사, 프로덕션 빌드 통과
- Firestore Rules와 인덱스 배포 dry run
- 모바일 주요 흐름 브라우저 QA
- 비밀 값이 Git에 포함되지 않음

## 17. 첫 실행 게이트

```text
Gate: HEENARI-FB-01 Firebase 앱 기반
Goal: 검증된 Google 계정만 희나리 앱 셸에 진입한다.
Non-goals: 예약 CRUD, 일정 CRUD, 관리자 회원 생성 UI, 배포
Source of truth: docs/heenari-lite-capability.md
Allowed surface: package files, src 앱 셸과 인증, Firebase config, Emulator config와 테스트
Forbidden surface: 기존 Supabase 운영 데이터, 원격 Firebase 프로젝트, 배포 환경
Validation: lint, unit tests, emulator auth/rules tests, production build, mobile browser smoke
Closeout: Gate 1 결과와 검증·생략 항목·다음 Gate를 docs에 기록
Next handoff: HEENARI-FB-02 30분 예약 엔진
```

## 18. 열린 결정

구현을 막지 않는 항목:

- 희나리 한 줄 소개
- 예약 가능 시간의 최종값 (연속 예약 길이는 태그 규칙으로 결정됨)
- 일정에 장소 입력이 필수인지 여부

구현 전에 확인해야 하는 외부 상태:

- 새 Firebase 프로젝트 ID
- 실제 운영 도메인
- (결정됨) 관리자 권한: Console 전용 `admins/{uid}` 문서
- 기존 Supabase에 이관해야 할 희나리 운영 데이터가 있는지 여부

## 19. 완료 정의

- 사용자는 검증된 Google 계정으로 로그인할 수 있다.
- 비로그인 사용자와 Google 이외 provider는 보호 데이터에 접근할 수 없다.
- 회원은 30분 단위로 겹치지 않는 예약을 만들고 관리할 수 있다.
- 모든 회원은 예약과 동아리 일정을 함께 확인할 수 있다.
- 회원은 자기 일정을, 관리자는 모든 일정을 관리한다.
- 핵심 권한과 동시 예약 시나리오가 Emulator 테스트로 재현된다.
- 모바일 360px 너비에서 주요 CTA와 일정 정보가 잘리지 않는다.
- 활성 코드와 사용자 화면에 Roomin, 빛소리, Supabase 흔적이 남지 않는다.
- 기존 구현은 Git 이력에서 복구 가능하다.

## 참고

- Firebase Authentication: https://firebase.google.com/docs/auth/web/start
- Firestore transactions: https://firebase.google.com/docs/firestore/manage-data/transactions
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/rules-conditions
- Firebase pricing plans: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
