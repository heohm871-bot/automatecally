# Deploy Report - February 12, 2026

## Scope
- Fixed Cloud Tasks dedupe/idempotency collision in `article_qa_fix` flow.
- Added safe handling for Cloud Tasks `ALREADY_EXISTS` on enqueue.
- Fixed image slot race condition so `top` slot is preserved during concurrent task writes.
- Added content bucket override support and configured runtime bucket.

## Key Changes
- `functions/src/lib/tasks.ts`
  - Added `ignoreAlreadyExists` option to `enqueueTask`.
  - Treats Cloud Tasks `ALREADY_EXISTS` as non-fatal when enabled.
- `functions/src/handlers/tasks/articleQa.ts`
  - `article_qa_fix` idempotency key now includes attempt:
    - `article_qa_fix:{siteId}:{articleId}:attempt-{n}`
  - Enabled `ignoreAlreadyExists` for downstream enqueues.
- `functions/src/handlers/tasks/articleQaFix.ts`
  - Re-qa enqueue key now includes fix attempt:
    - `article_qa:{siteId}:{articleId}:after-fix-{n}`
  - Enabled `ignoreAlreadyExists` for re-qa enqueue.
- `functions/src/handlers/tasks/imageGenerate.ts`
  - Preserves non-plan image slots (including `top`) to avoid overwrite during concurrent writes.
- `functions/src/lib/admin.ts`
  - Added `CONTENT_BUCKET` override for Storage target bucket.
- `functions/.env.blog-native-260212`
  - Added `CONTENT_BUCKET=blog-native-260212-assets` (runtime only; not committed).

## Verification
- New Cloud Tasks queues ensured: `light-queue`, `heavy-queue`.
- Full pipeline re-run with fresh runDate/keywordId completed.
- Verified terminal state:
  - `article_package`: success
  - `image_generate`: success
  - Article status: `packaged`
  - Image slots: `top`, `h2_1`, `h2_2`, `h2_3`, `h2_4` (count 5)

## Notes
- `.env` files remain ignored by git (`functions/.env*`).

## Appendix: Worklog
Source worklog files:
- `WORKLOG_2026-02-12.md`
- `docs/worklog/2026-02-12.md`

Verbatim (from the worklog):

# Worklog - 2026-02-12

## 오늘 완료된 작업
- 이미지 전략 보강
  - 인포그래픽 렌더러 추가 및 `imagePlan` 기반 슬롯 처리
  - 무료 이미지(Pixabay → DuckDuckGo) 실패 시 유료 이미지 fallback 스텁 추가(`PAID_IMAGE_PROVIDER=placeholder`)
- QA 수정 1회 워크플로 추가
  - `article_qa` 실패 시 `article_qa_fix` 1회 실행 후 재검증
  - 전역 설정 `generateImagesOnlyOnQaPass` 반영
- LLM 캡 집계/가드 스캐폴딩 추가
  - `llmUsage` 카운터 도입 및 `title/body/qaFix` 캡 체크 연결
- 웹 린트 오류 수정
  - `metrics`의 렌더 중 `Date.now` 호출 제거
  - `auth-provider`의 effect 내 sync setState 제거

## 테스트/린트 결과
- 루트
  - `npm test`: 실패 (스크립트 없음)
  - `npm run lint`: 성공
  - `npm run build`: 성공 (baseline-browser-mapping 업데이트 경고)
- `functions/`
  - `npm --prefix functions test`: 성공
  - `npm --prefix functions run lint`: 성공 (optional)
  - `npm --prefix functions run build`: 성공
- `apps/web/`
  - `npm --prefix apps/web run lint`: 초기 실패 → 수정 후 성공
  - `npm --prefix apps/web run build`: 성공

## 인프라 점검
- `infra/cloudtasks-queues.yaml` 기준:
  - `dev`: 더 보수적 (heavy 0.2 / light 2,5)
  - `staging`: 동일
  - `prod`: 더 공격적 (heavy 0.8 / light 8,20)

## 파일 정리
- `firestore-debug.log` 삭제

## 브랜치/커밋
- 브랜치: `feat/pipeline-images-qa-fix`
- 커밋: `bc51aec` `feat: add image fallback and QA fix flow`

## 남은 이슈/메모
- 유료 이미지 fallback은 스텁(`placeholder`)만 구현됨 → 실제 공급자 연동 필요
- QA Fix에서 `missing_hashtags_12` 자동 보정 없음
- LLM 실제 호출 경로 미연결 (모드 플래그만 존재)

---

## 추가 작업 기록 (2026-02-12 16:09 UTC)

### 이번 세션에서 완료한 작업
- 환경/배포
  - `functions/.env.blog-native-260212`에 `OPENAI_API_KEY` 반영
  - `.gitignore`에 `functions/.env*` 명시
  - `firebase deploy --only functions --project blog --force` 실행 및 반영 확인
- 파이프라인 장애 원인 분석 및 수정
  - 원인1: Cloud Tasks 큐 미생성(`light-queue`, `heavy-queue`) → 큐 생성 완료
  - 원인2: `article_qa_fix` enqueue dedupe 충돌(`ALREADY_EXISTS`)
  - `article_qa_fix` idempotency key를 attempt 포함 형태로 변경
  - enqueue에서 `ALREADY_EXISTS`를 옵션으로 무시(`ignoreAlreadyExists`)하도록 보강
  - `article_qa_fix` 이후 재검증(`article_qa`) key도 attempt 기반으로 분리
- 스토리지/이미지 안정화
  - 기본 버킷 접근 실패 대응을 위해 `CONTENT_BUCKET` 오버라이드 추가
  - 버킷 `gs://blog-native-260212-assets` 생성 및 env 반영
  - `image_generate`가 `topcard_render` 결과를 덮어쓰지 않도록 동시성 보정
- 실데이터 검증
  - 새 `runDate/keywordId`로 재트리거 반복 검증
  - 최종 성공 상태 확인:
    - `image_generate`: success
    - `article_package`: success
    - article `status`: `packaged`
    - 이미지 슬롯 5개(`top`, `h2_1`, `h2_2`, `h2_3`, `h2_4`)
- 문서/커밋
  - `DEPLOY_REPORT_2026-02-12.md` 작성
  - 커밋: `c23f04b` `fix: stabilize qa-fix dedupe and pipeline packaging`

### 다음에 할 작업
- Git 원격 푸시 완료
  - 현재 인증 부재로 `git push` 실패(`askpass` 경로 오류 + credentials 없음)
  - GitHub 인증 설정 후 `feat/pipeline-images-qa-fix` 브랜치 푸시 재시도
- 운영 안정화 후속
  - `firebase-functions` 최신 버전 업그레이드 검토(배포 경고 해소)
  - `article_qa_fix`/`article_qa` 태스크 정책(지연 재시도 30분) 운영 기준 점검
  - Storage 버킷 전략 정리(기본 버킷 vs `CONTENT_BUCKET` override)
