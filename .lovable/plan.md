## 업로드 코드 검토 결과

업로드한 두 파일을 현재 코드와 비교한 결과, **수정된 부분은 총 3곳**입니다. 모두 기존에 의심된 "사이드바 클릭 시 반응속도 저하 / 규정 조항 분할 오류" 문제에 대한 정밀한 패치입니다.

---

### 1. `src/routes/regulations.tsx` — 목록 쿼리 컬럼 축소 (성능)

**Before**
```ts
.from("regulations").select("*")
```
**After**
```ts
.select("id, file_name, file_format, category, effective_date,
        storage_path, parse_status, parse_error, note,
        is_image_based, created_at")
```

- `regulations.full_markdown` 컬럼은 파싱된 규정 본문 전체(수십 KB ~ 수 MB)인데, `select("*")`가 매 목록 조회마다 이 컬럼을 함께 내려받고 있었음.
- 규정 N개 × 평균 수백 KB → **응답 페이로드가 수 MB 단위**가 되어 사이드바에서 "규정 라이브러리" 진입 시 5~10초 지연이 발생하는 직접 원인.
- 목록 UI/상세 패널 어디에서도 `full_markdown`을 사용하지 않으므로 안전한 제거.

### 2. `src/routes/regulations.tsx` — React Query `staleTime: 30_000` 추가 (성능)

- `regulations` 목록과 `regulation-clauses` 쿼리 모두 `staleTime`이 0이라서 사이드바 메뉴를 오가거나 창에 포커스가 돌아올 때마다 매번 재요청 → 위 1번과 결합되어 체감 지연 가중.
- 30초 캐시로 **재방문/포커스 복귀 시 즉시 표시**되고, Realtime 구독이 이미 있어서 실시간 갱신은 그대로 유지됨(이중 안전장치).

### 3. `supabase/functions/extract-regulation/index.ts` — 조항 분할 fallback 정규식 (정확도)

**Before**
```ts
const re = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*\(([^)]+)\))?/g;
```
**After**
```ts
const re = /^[ \t]*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*\(([^)]+)\))?/gm;
```

- 기존 패턴은 본문 어디에서든 "제X조"를 매치해서, 다른 법 조항을 인용하는 문장("…국가계약법 **제4조의** 규정에 의한…")도 새로운 조항 시작으로 잘못 잘랐음. 결과: `regulation_clauses` 에 가짜 조항이 다수 생성되어 룰 매칭/findings 품질 저하.
- `^[ \t]*` + `m` 플래그로 **줄 시작에서만** 매치 → 인용구는 무시하고 진짜 조항 헤더만 분할.

---

## 자체 검증

| 항목 | 결과 |
|---|---|
| TS 타입 | `Regulation` 타입의 모든 필드가 select 리스트에 포함됨(✓). `full_markdown`은 타입에도 없으므로 제거해도 안전. |
| `selectedClauses`/Realtime 로직 | 변경 없음. `staleTime`은 invalidateQueries로 강제 재조회되므로 충돌 없음. |
| Edge Function 1차(Markdown 헤더) 분할 | 변경 없음 — 헤더가 있는 PDF는 영향 없음. |
| Edge Function fallback | "제1조(목적)\n…\n제2조(정의)" 같은 정상 케이스 ✓ 매치. "국가계약법 제4조의 규정" 같은 본문 인용 ✗ 매치(원하던 동작). |
| 기존 데이터 | 잘못 분할된 기존 `regulation_clauses` 행은 재파싱(파싱 재시도 버튼) 시 delete-then-insert로 자동 정정됨. |

## 적용 작업 (Implement 시)

1. `src/routes/regulations.tsx` 전체 교체 (업로드본 사용)
2. `supabase/functions/extract-regulation/index.ts` 전체 교체 (업로드본 사용)
3. 기타 파일은 손대지 않음

## 예상 효과

- 사이드바 → 규정 라이브러리 진입 지연이 **수 초 → 100ms대**로 감소(규정 개수와 본문 크기에 따라).
- 두 번째 진입 이후에는 캐시로 **즉시 렌더링**.
- 신규 업로드 규정의 조항 분할 정확도 향상 → 후속 룰 매칭/감사 결과 품질 동반 개선.

## 리스크 / 주의

- 기존에 잘못 분할된 규정은 자동 정정되지 않음 → 해당 규정에서 "파싱 재시도"를 한 번 눌러줘야 함(데이터 마이그레이션 없음).
- `staleTime: 30s` 동안은 다른 탭/사용자가 변경한 내용이 즉시 보이지 않을 수 있으나, 본 프로젝트에는 Realtime 구독이 있어 실질적 영향 없음.
