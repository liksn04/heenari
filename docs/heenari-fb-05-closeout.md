# HEENARI-FB-05 홈 다음 합주·동아리 공지 — Closeout

작성일: 2026-09-24
게이트: `docs/gates/HEENARI-FB-05-HOME-JAM-NOTICES.md`
상태: 코드 완료. Rules·인덱스 배포와 PR 머지 대기.

## 결과

- 홈 빨간 카드가 운영진 일정 대신 **동아리 전체의 다음 합주**를 보여준다. 동아리방 합주 예약과
  합주 태그 일정 중 끝나지 않은(진행 중 포함) 가장 이른 것. 날짜·시간, 장소, 잡은 사람과
  함께하는 회원, "일정에서 보기"(`/schedule?day=`) 링크. 시작한 합주는 "진행 중"으로 표시한다.
- **동아리 공지** 칸을 새로 만들었다. 홈은 최신 3개, `/notices`는 전체(최대 50개). 공지를 누르면
  본문이 시트로 열린다. 운영진에게만 공지 쓰기·수정·삭제(한 번 더 확인)가 보인다.
- 권한은 Rules가 막는다: `notices` 쓰기는 `admins/{uid}`가 있는 운영진만, 작성자·작성 시각은 불변.
- 여러 줄 입력칸(`textarea`)이 기본 고정폭 글꼴로 보이던 문제를 고쳤다(일정 모달 설명칸 포함).

## 변경 파일

- 신규: `src/heenari/home/NextJamCard.tsx`, `src/heenari/notices/`(notice·noticeRepository·useNotices·
  NoticeSheet·NoticeBoard와 테스트), `docs/gates/HEENARI-FB-05-HOME-JAM-NOTICES.md`
- 수정: `src/heenari/schedule/{timeline,eventRepository,useScheduleData}.ts`(`nextJam`,
  `fetchUpcomingJamEvents`, `useNextJam`; 기존 `nextUpcomingEvent`·`useUpcomingEvent` 대체),
  `src/heenari/reservations/repository.ts`(`fetchUpcomingJamReservations`), `src/heenari/pages.tsx`,
  `src/App.tsx`(`/notices`), `src/heenari.css`, `firestore.rules`, `firestore.indexes.json`,
  `tests/firestore.rules.test.ts`, `vitest.config.ts`, 문서

## 검증

- `npm run lint` 통과, `npx tsc -b` 통과
- `npm test` / `npm run test:coverage`: 40 files · 317 tests 통과, Stmts 97.8% · Branches 94.2%
- `npm run test:rules`(로컬 JDK 21): 62 tests 통과(공지 5개 추가)
  - 변형 검사: 공지 생성 권한을 회원까지 열기, `authorName` 불변 조건 제거, 삭제 권한을 회원까지
    열기 — 세 변형 모두 테스트 1개씩 실패로 잡혔다(검사 후 원복).
- `npm run build`, `npm run check:bundle`, `npm run check:notifier` 통과
- 모바일 QA(Vite 실제 렌더러, 목 데이터 하네스 `.fablize/qa`):
  - 390px: 긴 제목·긴 이름의 합주 카드, 공지 3개 목록(말줄임), 공지 본문 시트(줄바꿈 유지·긴 문장
    줄바꿈), 운영진 수정 폼, 저장 후 안내 — 가로 넘침 없음(scrollWidth 390, 시트 본문 390)
  - 360px: 공지 전체 화면 4개, 회원에게 쓰기 버튼 없음, 합주·공지 빈 상태 — 가로 넘침 없음(360)

## 남은 일

- 최신 main 폴더에서 `firebase deploy --only firestore`로 공지 Rules와 인덱스
  `reservations(tag,startAt)`·`events(tag,startAt)`를 배포한 뒤 머지한다.
- 운영진 계정으로 실제 공지를 올려 회원 화면에서 보이는지 확인한다.
