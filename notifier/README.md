# heenari-notifier — 합주 알림 Worker

Cloudflare Workers에서 1분마다 실행되어 다음 두 가지 푸시를 보낸다.

1. **합주 초대 알림**: 앱이 예약·일정을 저장할 때 같은 쓰기로 남긴 `pushJobs` 작업을 꺼내,
   그 문서의 실제 참여자인지 다시 확인한 뒤 보낸다. 처리한 작업은 지운다.
2. **합주 1시간 전 알림**: 1시간 안에 시작하는 `jam` 태그 예약·일정을 찾아 예약자와 참여자에게 보낸다.
   `pushLog/{key}`에 기록해 한 번만 보낸다(시작 시각이 바뀌면 다시 보냄).

만료된 기기 토큰은 발송 중에 확인해 `members/{uid}/devices`에서 지운다.

## 처음 설정 (한 번만, 운영자 계정으로)

> 서비스 계정 키(JSON)는 **절대 저장소에 넣지 않는다.** Cloudflare 비밀값으로만 넣고, 넣은 뒤 내려받은 파일은 지운다.

### 1. 웹 푸시 공개 키(VAPID)

1. Firebase Console → 프로젝트 설정 → **Cloud Messaging** → 웹 구성 → **웹 푸시 인증서** → 키 쌍 생성
2. 나온 **공개 키**를
   - 로컬 `.env.local`의 `VITE_FIREBASE_VAPID_KEY=`에 넣고
   - GitHub 저장소 Settings → Secrets → Actions에 `VITE_FIREBASE_VAPID_KEY`로 추가한다.
   (공개 키라 앱에 들어가도 괜찮다. 개인 키는 Firebase가 보관한다.)

### 2. 알림 전용 서비스 계정

1. Google Cloud Console → IAM 및 관리자 → 서비스 계정 → **만들기** (예: `heenari-notifier`)
2. 역할 두 개만 부여
   - `Cloud Datastore 사용자` (roles/datastore.user) — Firestore 읽기·쓰기
   - `Firebase Cloud Messaging API 관리자` (roles/firebasecloudmessaging.admin) — 푸시 발송
3. 서비스 계정 → 키 → **JSON 키 만들기** → 파일이 내려받아진다.
4. API 및 서비스에서 **Firebase Cloud Messaging API (V1)**가 사용 설정돼 있는지 확인한다.

### 3. Cloudflare에 배포

```bash
cd notifier
npx -y wrangler@4 login          # Cloudflare 계정으로 로그인(무료 플랜)
npm run secret                   # 2에서 받은 JSON 파일 내용을 통째로 붙여넣기
npm run deploy                   # 1분 cron 과 함께 배포
```

붙여넣은 뒤 내려받은 JSON 파일은 삭제한다.

### 4. Firestore Rules·인덱스 배포

이 게이트에서 `members`, `pushJobs`, `participantIds` 규칙과 참여자 조회 인덱스가 추가됐다.
저장소 루트에서:

```bash
npx -y firebase-tools@latest deploy --only firestore
```

## 확인

```bash
cd notifier
npm run tail     # 실시간 로그. 보낸 건이 있으면 heenari-notifier {...} 요약이 찍힌다.
```

- 휴대폰에서 희나리 → 내 정보 → **합주 알림 켜기** (아이폰은 홈 화면에 설치한 앱에서)
- 다른 계정으로 합주를 잡으며 초대 → 1분 안에 "합주 초대" 알림
- 1시간 안에 시작하는 합주를 잡으면 1분 안에 "합주 N분 전" 알림

## 비용과 한도 (40명 규모 기준 추정)

- Cloudflare Workers 무료: 하루 10만 요청. cron 1분 = 하루 1,440회.
- Firestore 무료(Spark): 하루 읽기 5만. cron 한 번에 빈 조회 3번 ≈ 하루 4,300 읽기 + 발송 건.
- FCM: 무료.

## 개발

코드와 테스트는 저장소 루트에서 실행한다.

```bash
npx vitest run notifier        # 로직·Firestore·FCM·통합 테스트
npm run check:notifier         # 타입 검사
```
