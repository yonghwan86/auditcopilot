## 변경 사항 요약

업로드된 `regulations.tsx`와 현재 프로젝트 파일을 비교한 결과, 다음 5가지 개선이 포함되어 있습니다.

### 1. `safeUUID()` 헬퍼 추가
- `crypto.randomUUID()`가 일부 sandbox/iframe 환경에서 undefined인 문제 대비 폴백 구현
- Storage 경로 생성 시 `crypto.randomUUID()` → `safeUUID()` 로 교체

### 2. `clauseCounts` 쿼리 제거 (성능 개선)
- 매번 `regulation_clauses` 테이블 전체를 스캔하던 카운트 쿼리 삭제
- 목록 테이블의 `ParseStatusBadge`에서는 조항 개수 미표시
- 상세 패널에서는 `selectedClauses.length`로 대체

### 3. Realtime 구독 최적화
- `regulation_clauses` INSERT 이벤트 구독 제거 (조항 1개당 1이벤트로 폭주하던 원인)
- `regulations` 테이블의 `parse_status` 변경만 감지
- `completed`/`failed` 시점에만 조항 목록 갱신
- 200ms throttle 타이머로 invalidate 호출 묶음 처리

### 4. 파일 보기 팝업 차단 회피
- `handleView`에서 클릭 직후 `window.open("about:blank")`로 먼저 탭을 열고, signedUrl 받은 뒤 `newWindow.location.href`로 이동
- 팝업 차단된 경우 같은 탭에서 열도록 폴백
- 에러 시 임시 탭 닫기

### 5. 사소한 주석/구조 정리

## 실행 계획

1. `src/routes/regulations.tsx`를 업로드된 버전으로 교체 (단일 파일 변경)

다른 파일(라우팅, DB 스키마, Edge Function, 디자인 토큰)은 변경 없음.