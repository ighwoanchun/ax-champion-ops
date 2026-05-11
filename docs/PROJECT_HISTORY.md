# AX Champion Program 운영 — 프로젝트 이력

> 원티드랩 사내 AI Transformation 부트캠프 운영 프로젝트.
> 3기(2026.05.11~07.10) 운영을 위한 문서·자동화 산출물 이력.

---

## Phase 0. 컨텍스트 파악 & 슬랙 채널 셋업 (2026-05-07)

| 지시 내용 | 실행 내용 |
| --- | --- |
| Confluence AX Champion Program 문서 구조 파악 | 홈페이지(4513759649) + 개요·프레임워크·운영매뉴얼·3기 운영가이드 4개 페이지 정독, 1~3기 페이지 트리(70+) 매핑 |
| 모집 완료 / 슬랙 채널 개설 (C0B1PCMEQBD) | 운영진이 사전 처리. 본 프로젝트 작업 디렉토리에 운영 산출물 누적 시작 |
| Confluence 운영가이드 기반으로 슬랙 채널 운영 가이드 작성 | `docs/slack-channel-operations-guide.md` 신규 작성 (10장 + 부록, 채널 셋업·9주 캘린더·메시지 템플릿 9종·미제출자/이탈자 관리·셀프 점검 포함) |

### 산출물

- `docs/slack-channel-operations-guide.md` — 슬랙 채널 운영 마스터 가이드
- `docs/PROJECT_HISTORY.md` — 본 문서 (Phase 단위 이력)

---

## 아키텍처 / 운영 체계

### 운영 모델
- B2B 사내 부트캠프 모델 (회사 비용 부담, 사내 실무 데이터, 업무시간 내 배정)
- 9주 단일 트랙 운영 (3기부터 트랙 분리 폐지)
- 매주 수요일 = 공유의 날 (오프라인 ↔ 슬랙 스크럼 격주 교대)

### 도구 스택
| 영역 | 도구 |
| --- | --- |
| 문서 | Confluence (ACP1 스페이스) |
| 일상 소통 | Slack `#ax-champion-3기` (C0B1PCMEQBD) |
| 전사 가시성 | Slack `#ai-줍줍` |
| 폼·설문 | Google Form |
| 데이터 관리 | Google Sheets |
| AI 에이전트 검증 | ennoia 플랫폼 (3기 신규 검증 대상) |

---

## 핵심 성과 지표 (기수별)

| 항목 | 1기 | 2기 | 3기 (운영 대상) |
| --- | --- | --- | --- |
| 기간 | 2026.01~02 | 2026.03~04 | 2026.05.11~07.10 |
| 참가자 | 18명 | 37명 | 20명 (선발 완료) |
| 활동 인원 | 18명 | 35명 | TBD |
| 프로젝트 수 | 41건 | 87건 | TBD |
| 전반적 만족도 | 4.4 | 4.24 | TBD |
| 추천 의향 | 4.8 | 4.53 | TBD |
| NPS | — | +53 | TBD |

### 3기 특별 목표
1. **밀도 복원** — 20명 소규모로 1기 수준의 공유 밀도 회복
2. **ennoia 검증** — 참가자당 ennoia 에이전트 2건 이상 개발 필수
3. **4기 운영진 발굴** — 1~3기 연속 참가자 중 4기 다반(多班) 운영 후보 선발

---

## Phase 1. 주간 운영 자동화 — 구현 계획 v1 → v2 (2026-05-07)

| 지시 내용 | 실행 내용 |
| --- | --- |
| 주간 운영 자동화 구현 계획 수립 | `docs/automation-implementation-plan.md` v1 작성 — 자동화 9개 항목(A1~A9), 의사결정 Q1~Q6 + D1~D3 |
| 사용자 답변 수령 (Q1·Q2·Q3·Q5·Q6·D1·D2·D3) | Q3: Vercel→backyard, Q4(D3): A1+A3(채널 멘션)+A4 / 마감 5/8, D1: node-cron, D2: Sheets+Postgres 하이브리드 |
| backyard 환경 분석 (사용자 스크린샷) | sales-flow 사례 분석 — K8s PaaS, 환경변수 탭, 컨테이너 stdout 로그, postgresql 템플릿 사용 가능 확인 |
| 계획서 v2 갱신 | `automation-implementation-plan.md` 전면 재작성 — backyard 디렉토리 구조, node-cron 전략, 하이브리드 데이터 모델, A3 채널 멘션 방식, Postgres 스키마(scrum_submissions/dropout_signals/audit_log/cron_runs), dry-run 모드 |
| 사용자 액션 체크리스트 작성 | `docs/setup-checklist.md` 신규 작성 — Slack Bot 등록·backyard·Postgres·Sheets·Service Account 발급 절차 8단계 |
| 운영가이드 §6-D 정책 변경 | DM 리마인드 → **공개 채널 멘션 안내** 로 수정 (`slack-channel-operations-guide.md` §5-3, §6-D) |

### 산출물
- `docs/automation-implementation-plan.md` v2 — backyard 기반 마스터 계획
- `docs/setup-checklist.md` — 사용자 액션 8단계 체크리스트
- `docs/slack-channel-operations-guide.md` §5-3·§6-D 갱신

### 확정된 의사결정 (모두 ✅)
| 항목 | 답변 |
| --- | --- |
| Q1 Slack Bot | ✅ |
| Q2 Sheets SA | ✅ |
| Q3 배포 환경 | ✅ backyard |
| Q4/D3 MVP 범위 + 마감 | ✅ A1+A3(채널 멘션)+A4 / 5/8 |
| Q5 봇 이름 | ✅ AX 챔피언 운영봇 |
| Q6 dry-run | ✅ 5/9~5/10 |
| D1 Cron 전략 | ✅ 단일 컨테이너 + node-cron |
| D2 데이터 저장소 | ✅ Sheets + Postgres 하이브리드 |

---

---

## Phase 2. 자동화 MVP 구현 (2026-05-07)

| 지시 내용 | 실행 내용 |
| --- | --- |
| 코드 1차 스캐폴딩 | `backyard.json`, `package.json`, `tsconfig.json`, `next.config.ts`, `Dockerfile`, `.env.example`, `.gitignore`, `.dockerignore`, `app/{layout,page,api/health}`, `instrumentation.ts` 작성 |
| 의존성 설치 | next 16, react 19, @slack/web-api, googleapis, pg, node-cron, zod, date-fns-tz, tsx, typescript (123 패키지) |
| lib 핵심 모듈 6개 작성 | `lib/env.ts` (zod 검증), `lib/schedule.ts` (9주 캘린더 + W1 kickoff/짝수 slack/홀수 offline 규칙), `lib/db.ts` (pg pool + cron lock + scrum 기록 + audit_log), `lib/slack.ts` (WebClient + DRY_RUN 분기 + 채널 멤버/메시지 조회), `lib/messages.ts` (§6 템플릿 + 스크럼 식별 정규식), `lib/sheets.ts` (participants/weekly_report read·write·append) |
| MVP Cron 핸들러 3종 | `server/cron/a1-monday-announce.ts` (월 09시 채널 안내, kickoff/offline/slack 분기), `server/cron/a3-wednesday-channel-remind.ts` (수 15시 미제출자 채널 멘션 안내, slack 주차만), `server/cron/a4-wednesday-finalize.ts` (수 18시 마감 + Postgres 기록 + Sheets 미러링 + 운영진 DM 요약) |
| Cron 등록 | `server/cron/register.ts` (KST, A1=Mon09, A3=Wed15, A4=Wed18) + `instrumentation.ts` 부팅 시 1회 등록 |
| 스크립트 3종 | `scripts/migrate.ts` (db/migrations/*.sql 순차 실행), `scripts/sync-participants.ts` (Slack 채널 멤버 ↔ Sheets participants 머지), `scripts/fire-cron.ts` (수동 트리거) |
| 검증 | `tsc --noEmit` 0 에러 / 호스트 `next build` 는 한글 디렉토리(`AX챔피언 운영`) 로 turbopack panic — Docker 빌드는 `/app` 으로 격리되어 무관 / **Docker 빌드 성공** + 로컬 컨테이너 **health check 200** (env 없이도 부팅 OK) |

### 사용자 액션 진행 (병렬, 2026-05-07 시점)
- ✅ Slack Bot 등록 + 권한 + 워크스페이스 설치 + 채널 초대 (Manifest 방식)
- ✅ backyard 프로젝트 생성: `https://ax-champion-bot.labs.wntd.co/`
- ✅ Slack Admin User ID: `U03EK844MU2`
- ⏳ §5 backyard PostgreSQL 템플릿 추가 (`ax-champion-bot-db`)
- ⏳ §6 Google Sheet + 3 탭 헤더
- ⏳ §7 Google Service Account 발급
- ⏳ §8 backyard 환경변수 12개 주입

---

## Phase 2.5. 운영 환경 사전 점검 & git repo 분리 (2026-05-11)

| 지시 내용 | 실행 내용 |
| --- | --- |
| backyard MCP 재설치 (플랫폼 업데이트 대응) | 사용자가 기존 MCP 제거 후 신규 user-scope HTTP MCP 재등록 — `claude mcp list` 결과 `backyard: ✓ Connected` 정상화. `list_projects` / `list_secrets` / `get_project` / `exec_in_pod` 호출 전부 성공 확인 |
| ax-champion-bot 환경 변수 입력 결과 확인 요청 | `proj-spv4xk` 시크릿 `[]` (빈 배열), frontend Pod `env` 출력에 `SLACK_*` / `GOOGLE_*` / `DATABASE_URL` / `ADMIN_API_TOKEN` 등 **사용자 정의 변수 전무** — backyard 대시보드 환경 변수 탭에 저장이 안 됐거나 저장 후 재배포 미수행 상태로 추정 |
| 보안 사고 — 채팅창에 backyard MCP 토큰 평문 노출 | base64 디코딩 시 본인 계정 식별 가능한 토큰. Claude Code 대화 로그/캐시에 영구 보존 위험 → 토큰 **revoke + 재발급** 권장 (사용자 후속 처리 예정) |
| 작업 디렉토리가 부모 git repo(`/Users/ighwoanchun/`)의 `.gitignore: claude_test/` 규칙에 의해 무시되는 상태 발견 | `AX챔피언 운영/` 폴더에 별도 `git init` 수행 → PROJECT_HISTORY.md를 비롯한 모든 운영 산출물을 독립 repo로 추적 가능하게 함 |

### 산출물
- `docs/PROJECT_HISTORY.md` 갱신 (본 Phase 추가)
- 별도 git repo (`AX챔피언 운영/.git`) — 초기 커밋

### 운영 환경 상태 (2026-05-11 시점)
| 항목 | 상태 |
| --- | --- |
| backyard 프로젝트 | ✅ `ax-champion-bot` (proj-spv4xk) Running, `ax-champion-bot-db` (proj-ejg0xc) Running |
| backyard 시크릿 | ❌ 0건 — `setup-checklist.md §8` 12개 변수 주입 필요 |
| Slack Bot | ✅ 등록 + 채널 초대 완료 |
| Google Sheets / SA | ⏳ 미확인 |
| Postgres 마이그레이션 | ⏳ 미실행 |

---

## 다음 Phase 후보

- **Phase 3. backyard 배포 + dry-run** — 환경변수 12개 주입 → 재배포 → DRY_RUN 모드 운영진 본인 DM 검증 → dry-run 1주
- **Phase 4. W1 킥오프 운영** — 안내 메시지 발송, 핀 메시지 3종 게시, 킥오프 워크숍 운영, 팀 편성 결과 정리
- **Phase 5. W2~W8 주간 운영** — 자동화 가동 + 미제출자 케어 + ai-줍줍 큐레이션
- **Phase 6. W5 팀 교체** — 희망 조사 + 새 팀 편성 + Confluence 페이지 업데이트
- **Phase 7. W9 최종 발표 + 회고** — 발표회 운영 + 우수 프로젝트 선발 + 회고 설문 + 타운홀 발표
