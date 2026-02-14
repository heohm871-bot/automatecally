# NEXT_SESSION (누적 작업 로그)

- 이 파일은 누적형 작업 인수인계 문서입니다.
- 매 세션 마지막에는 반드시 이 파일에 최신 상태를 정리합니다.

## 2026-02-13

- Worklog: `docs/worklog/2026-02-13.md`
- 핵심: `status`(process)와 `lifecycle`(governance) 분리 변경을 A 단독 브랜치/PR로 분리 완료
  - A 브랜치: `feat/lifecycle-status-split` (push 완료, PR 생성 가능)
  - B 변경은 별도 커밋들로 분해해 `feat/pipeline-images-qa-fix`로 복구(cherry-pick) 완료
- 주의: `infra/firestore.rules` 권한 정책 변경이 포함되어 있어 prod 반영 전 검토 필요
  - `scripts/native-cutover-check.sh`는 이제 `INFRA_ENV=prod`로 rules/indexes를 base 템플릿에 sync 후 deploy 하도록 보강(실수 방지)
  - A 브랜치 기준 검증: `npm --prefix functions test` 통과, `npm --prefix apps/web run build` 통과

- B 추가 진행(예약발행 실행기/CI 안정화):
  - `publish_execute` 태스크 추가 + (초기) tistory publish 연동
  - CI(`functions-e2e-once`) 실패 원인 분석 중: 여전히 `status != packaged` 케이스 존재
    - 다음 세션 1순위: PR run artifacts의 `functions-e2e-log` + dump(`taskFailures.json`, `articles.json`)로 원인 확정 후 수정

## 2026-02-11

# Worklog - 2026-02-11

## 오늘까지 완료된 작업
- 최신 주요 커밋: `b2ee0ab` (2026-02-11)
- 커밋 메시지: `feat: add functions pipeline, web admin pages, and e2e workflow`
- 반영된 큰 범위:
  - `functions/`: 파이프라인 핸들러/태스크, 유틸, e2e dev 스크립트, 테스트 추가
  - `apps/web/`: admin 페이지(`articles`, `metrics`, `sites`) 및 auth 관련 컴포넌트 추가
  - `infra/`: 환경별(`dev/staging/prod`) Firestore rules/indexes, Cloud Tasks queue 설정
  - `.github/workflows/e2e-once.yml`: E2E 실행 워크플로 추가
  - `packages/shared/`: scoring/intent/image/title 관련 공유 로직 추가

## 현재 워킹트리 상태
- 미커밋 파일:
  - `firestore-debug.log` (untracked)
- 현재 브랜치에서 최근 커밋 수: 2개
  - `b2ee0ab feat: add functions pipeline, web admin pages, and e2e workflow`
  - `c888869 Initialized workspace with Firebase Studio`

## 내일 시작 체크리스트 (2026-02-12)
1. `git status --short`로 워킹트리 상태 재확인
2. `firestore-debug.log` 처리 결정
   - 유지 필요 시 `.gitignore` 정책 확인
   - 불필요 시 삭제 후 상태 정리
3. 우선 검증
   - 루트: `npm test` (또는 현재 프로젝트 표준 테스트 커맨드)
   - 필요 시 `functions/`, `apps/web/` 개별 테스트/린트 실행
4. 인프라 설정 점검
   - `infra/environments/*`와 실제 배포 환경 차이 확인
5. 이어서 진행할 기능/버그 이슈 선정 후 브랜치 작업 시작

## 빠른 탐색 포인트
- 파이프라인 엔트리: `functions/src/index.ts`
- 태스크 라우팅: `functions/src/handlers/taskRouter.ts`
- 핵심 태스크들: `functions/src/handlers/tasks/`
- 웹 관리자 진입점: `apps/web/src/app/page.tsx`
- 인프라 문서: `infra/README.md`

## 메모
- 오늘 기준(2026-02-11) 코드베이스는 대규모 초기 구축 커밋이 이미 반영된 상태.
- 내일은 "로그 파일 정리 + 테스트/린트로 기준선 확인"부터 시작하는 것을 권장.

---

## 2026-02-11 (세션 업데이트 2)

### 이번 세션에서 반영한 내용
- 기준선 정리
  - `.gitignore`에 `firestore-debug.log` 추가
- E2E 사전검증 추가
  - `functions/scripts/preflight.mjs` 신설
  - 검증 항목: `FIRESTORE_EMULATOR_HOST`, task endpoint(또는 inline), `TASK_SECRET`, `PIXABAY_API_KEY`(없으면 경고), 주요 에뮬레이터 포트 연결성
  - `functions/package.json`에 `preflight` 스크립트 추가
  - `e2e:once` 실행 전에 preflight가 자동 실행되도록 연결
- 파이프라인 trace 강화
  - `functions/src/lib/pipelineTimeline.ts`에서 task 실행 시 `articles/{id}.trace[]`에 시작/종료(성공/실패) append
  - 기존 `pipelineHistory`도 유지
  - E2E 덤프에 `trace` 필드 포함 (`functions/src/dev/dumpE2eData.ts`)
- E2E 성공판정 고정
  - `functions/src/dev/e2eOnce.ts`에서 성공 기준을 `articles/{id}.status == "packaged"`로 고정
  - `packagePath` 존재 검증은 유지
- 상태 전이 보강
  - `titleGenerate`/`articleGenerate`: `queued`
  - `bodyGenerate`: `generating`
  - `articleQa`: 실패 시 `qa_failed`
  - `articlePackage`: 완료 시 `packaged`
- 운영 화면 개선 (`apps/web/src/app/articles/page.tsx`)
  - 상태칩 확장: `queued/generating/qa_failed/ready/packaged/published`
  - 상세 패널 추가: 대표키워드 3개, title similarity, 이미지 슬롯 5개 상태, trace 로그, packagePath

### 검증 결과 (기준선)
- `cd functions && npm run build` 통과
- `cd functions && npm test` 통과 (9/9)
- `cd apps/web && npm run build` 통과

### 다음 세션에서 바로 할 일
1. Firestore emulator에서 `npm run e2e:once --prefix functions` 실제 1회 실행 확인
2. `articles.trace`가 task 시작/종료 순서대로 누적되는지 샘플 문서 1건 점검
3. 필요 시 `functions/scripts/preflight.mjs`에 필수 키 정책(`PIXABAY_API_KEY`를 hard fail로 올릴지) 최종 결정
4. `sites`/`metrics` 운영 필드(목표 생성량, 예약 시간대, proxy metric 입력) 확장

---

## 2026-02-11 (세션 업데이트 3)

### 진행 결과
- E2E 실실행 검증 완료 (Firestore emulator)
  - 실행 커맨드: `firebase-tools emulators:exec --only firestore ... cd functions && TASK_SECRET=dev-secret npm run e2e:once`
  - 결과: `E2E_OK`
  - 성공 판정 확인: `articles/{id}.status == "packaged"`
  - 예시 runId: `run-1770822153197`, `run-1770822193337`
- trace 누적 검증 완료
  - `functions/.artifacts/articleHistory.json`에서 `trace[]` 확인
  - task running/success 이벤트가 실제로 append 되는 것 확인
- 운영 화면 확장 (2순위 작업 진행)
  - `apps/web/src/app/sites/page.tsx`
    - 필수 필드 기반 site 생성 지원: `siteId`, `platform`, `topic`, `growthOverride`, `isEnabled`
    - 운영 필드 추가: `dailyTarget`(기본 3), `publishWindows`(콤마 구분 시간대)
    - 사이트 enable/disable 빠른 토글 추가
  - `apps/web/src/app/metrics/page.tsx`
    - 입력 필드 확장: `pv_24h`, `pv_72h`, `comments`, `likes`, `avgTimeSec`, `searchRatio`, `clusterId`, `templateId`, `ctrProxy`, `dwellProxy`
    - 자동 계산 추가:
      - 전주 대비 `pv_24h` 변화율
      - 클러스터별 평균(`pv24Avg`, `likesAvg`)
      - 템플릿 승자(`score` 평균 최상위)

### 검증
- `cd apps/web && npm run build` 통과
- E2E preflight는 `PIXABAY_API_KEY` 없음 시 경고로 처리(하드 실패 아님)

### 남은 우선 작업
1. `sites` 컬렉션에 실제 3개 사이트 seed/마이그레이션 적용
2. `metrics` 계산 결과를 `siteMetricsDaily` 같은 요약 컬렉션으로 적재할지 결정
3. `articles` 화면에서 trace 정렬 기준(시간 오름차순/내림차순) 최종 UX 정리
4. CI(`.github/workflows/e2e-once.yml`)에 preflight 독립 스텝 추가 여부 결정

---

## 2026-02-11 (세션 업데이트 4)

### 요청 항목 1/2/3 반영
- 1) sites 3개 seed/verify
  - 추가: `functions/src/dev/seedSites.ts`, `functions/src/dev/verifySites.ts`
  - 스크립트: `npm run sites:seed --prefix functions`, `npm run sites:verify --prefix functions`
  - 에뮬레이터 실행 결과: 3개 사이트 생성 확인
    - `site-naver-life`, `site-naver-money`, `site-tistory-tech`

- 2) `siteMetricsDaily` 집계 저장
  - 수정: `functions/src/handlers/tasks/analyzerDaily.ts`
  - 기능: `postMetrics`를 siteId 기준으로 집계해서 `siteMetricsDaily/{siteId}_{runDate}`에 저장
  - 저장 필드(핵심):
    - `pv24AvgDay`, `pv72AvgDay`, `likesAvgDay`, `commentsAvgDay`
    - `curr7dPv24Avg`, `prev7dPv24Avg`, `wowPv24Pct`
    - `clusterAverages[]`, `templateWinner`
  - 검증용 스크립트 추가: `functions/src/dev/analyzerDailySmoke.ts`
  - 실행 결과: `siteMetricsDaily/site-naver-life_2026-02-11` 생성 확인

- 3) CI preflight 독립 스텝
  - 수정: `.github/workflows/e2e-once.yml`
  - 추가 스텝: `Preflight check (independent)`
  - 방식: Firestore emulator 내에서 `npm run preflight --prefix functions -- --mode=e2e` 선실행

### 검증 커맨드
- `cd functions && npm run build && npm test` 통과
- `firebase-tools emulators:exec --only firestore ... "cd functions && npm run sites:seed && npm run sites:verify"` 통과
- `firebase-tools emulators:exec --only firestore ... "cd functions && npm run analyzer:smoke"` 통과

---

## 2026-02-11 (세션 업데이트 5)

### 추가 진행 내용
- `articles` trace 정렬 UX 마무리
  - 파일: `apps/web/src/app/articles/page.tsx`
  - 기능: trace 정렬 토글 추가 (`최신순` / `오래된순`)
  - 정렬 기준: `trace[].at` timestamp

- `preflight` 필수키 정책 확장
  - 파일: `functions/scripts/preflight.mjs`
  - 추가: `--require-pixabay` 플래그
  - 추가: `PREFLIGHT_REQUIRE_PIXABAY=1|true` 환경변수 정책
  - 결과: 기본 모드에서는 warning, 필수 모드에서는 error 로 동작 분기

### 검증
- `cd apps/web && npm run build` 통과
- `cd functions && TASKS_EXECUTE_INLINE=1 TASK_SECRET=dev-secret npm run preflight -- --mode=default` 통과
- `cd functions && TASKS_EXECUTE_INLINE=1 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 TASK_SECRET=dev-secret npm run preflight -- --mode=e2e --require-pixabay`
  - 의도대로 실패 확인 (픽사베이 키 누락 + 에뮬레이터 포트 미기동)

---

## 2026-02-11 (세션 업데이트 6)

### 이번에 진행한 순서
1. `settings/global` 중앙 설정 적용
2. 예약/수동 발행 모드 기반 필드 연결
3. 준최2 자동 추천 로직(analyzer) 확장
4. 이미지 메타/무료 fallback 보강

### 반영 상세
- 중앙 설정(11번)
  - 추가: `functions/src/lib/globalSettings.ts`
  - 적용 지점:
    - `functions/src/index.ts`: enqueue jitter(120~300 기본) 전역 설정 참조
    - `functions/src/handlers/taskRouter.ts`: retrySameDayMax/retryDelaySec 전역 설정 참조
    - `functions/src/handlers/tasks/kwScore.ts`: growth 컷 전역 설정 참조
  - 시드 스크립트 추가:
    - `functions/src/dev/seedGlobalSettings.ts`
    - `npm run settings:seed --prefix functions`

- 예약/수동 발행 기반(8번 기반)
  - `apps/web/src/app/sites/page.tsx`
    - 필드 추가: `publishMode(scheduled/manual)`, `publishMinIntervalMin`
  - `functions/src/handlers/tasks/articlePackage.ts`
    - `publishPlan` 저장: `{ mode, minIntervalMin, scheduledAt }`

- 준최2 자동 추천(9번 일부 구현)
  - `functions/src/handlers/tasks/analyzerDaily.ts`
    - `siteMetricsDaily/{siteId}_{runDate}`에 추천 정보 저장:
      - `recommendations.midCompetitionIncreaseRecommended`
      - `recommendations.targetMidCompetitionShare`
      - `recommendations.reasons(recentHighPvCount, qaFailRate, titleSimAvg)`
    - 클러스터 진도 저장:
      - `clusters/{siteId}_{clusterId}`에 `postedCount`, `phase2EntryRecommended`

- 이미지 전략 보강(7번 일부 구현)
  - `functions/src/handlers/tasks/imageGenerate.ts`
    - Pixabay 우선 + DuckDuckGo fallback 경로 연결
    - 이미지 메타 저장 강화:
      - `sourceUrl`, `pageUrl`, `licenseUrl`, `author`, `downloadedAt`, `slot`

### 검증
- `cd functions && npm run build && npm test` 통과
- `firebase-tools emulators:exec --only firestore ... "cd functions && npm run settings:seed && npm run analyzer:smoke"` 통과
  - `settings/global` 시드 확인
  - `siteMetricsDaily/site-naver-life_2026-02-11` 문서 생성 및 추천 필드 확인
- `cd apps/web && npm run build` 통과

### 현재 남은 큰 항목
1. 예약발행 실제 실행기(게시 API 연동/스케줄러) 구현
2. DuckDuckGo fallback 실제 수집기(현재는 구조 연결, 소스 구현은 최소 상태)
3. `settings/global` 값을 Web 콘솔에서 수정하는 Admin UI 추가

---

## 2026-02-14

- Worklog: `docs/worklog/2026-02-14.md`
- 핵심 상태
  - Cost control(PR #15) 운영 반영: functions/indexes deploy 완료
  - Web deploy: Firebase Hosting 경로 없음(설정 부재) → Vercel 워크플로/런북 추가됨
    - Runbook: `docs/runbooks/web-deploy.md`
    - Workflow: `.github/workflows/web-deploy-vercel.yml`
  - runDate 표준: KST(UTC+9) `YYYY-MM-DD`
    - 문서: `docs/runbooks/runDate.md`
    - `/ops` 기본 날짜 KST로 표준화됨
  - PR #18(budgets-alerts-hardstop): `apps/web/src/app/ops/page.tsx` 충돌을 로컬 rebase로 해결 후 force-with-lease 푸시 완료

- 다음 세션 체크리스트(운영 반영)
  1) PR #18 squash merge (conflicts 없음 + checks green 확인)
  2) Vercel secrets/env 설정 후 web deploy 실행 → 운영 URL에서 `/ops` 확인
  3) `settings/global.budgets` 값 세팅 후 80%/100% 동작 검증(BUDGET_EXCEEDED + alertsSent dedup)
  4) 필요 시 cost recompute(dryRun→apply)로 집계 정합성 재확보
