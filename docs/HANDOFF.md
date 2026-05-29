# AX 챔피언 운영봇 — 현황 인계 문서

> 마지막 업데이트: 2026-05-29 (Phase 3 완료, DRY_RUN 가동 대기)
> 본 문서만 읽어도 다음 세션이 끊김 없이 이어갈 수 있도록 자체 완결적으로 정리.

---

## 1. 프로젝트 한 줄

원티드랩 사내 부트캠프 **AX Champion Program 3기**(2026-05-11 ~ 07-10, 9주, 20명) 운영을 **운영진 1인**이 빠짐없이 굴리도록 만드는 **슬랙 자동화 봇** + 운영 문서 세트.

- 작업 디렉토리: `/Users/ighwoanchun/claude_test/AX챔피언 운영/`
- 별도 git repo: `main` 브랜치
- 사용자: `ighwoan.chun@wantedlab.com`
- 운영 URL: `https://prj-frontend-spv4xk.lab.wntd.co` (사내망)

## 2. 핵심 자동화 (MVP — 가동 대기 중)

매주 수요일 사이클이 운영진의 망각과 무관하게 굴러가게 한다.

| 잡 | 시점(KST) | 동작 | 상태 |
|---|---|---|---|
| **A1** | 월 09:00 | `#ax-champion-3기` 채널에 주간 안내 게시. W1 kickoff / 짝수 주 slack / 홀수 주 offline 분기 | ✅ 검증 완료 |
| **A3** | 수 15:00 (slack 주차만) | 채널 메시지 스캔 → `📌 위클리 스크럼` 미작성자만 골라 **공개 채널에서 멘션** + 가벼운 마감 안내 | ✅ 검증 완료 |
| **A4** | 수 18:00 (slack 주차만) | 제출 현황 Postgres 기록 + Sheets `weekly_report` 미러링 + 운영진 DM 요약 (**ai-줍줍 주 2건 미달자 섹션 포함**) | ✅ 검증 완료 |

**Out of scope (운영진 수동)**: 1:1 케어 DM, 이탈 처리 판단, 팀 재편성.

**ai-줍줍 채널**: 참가자가 주 2건 자발적 게시 (전사 가시성). 봇은 **read-only 트래킹** — `lib/slack.ts:postMessage`에 ai-줍줍 채널 ID 호출 시 throw 가드 추가. A4 마감 요약에 미달자 한 줄 표시. ⚠️ 봇이 운영진 게시를 대행하지 않음 (자주 오해되는 부분).

Phase 2 예정 잡: A2 (수 10시 운영진 스크럼 선도), A6 (금 주간리포트), A8 (이탈 징후 감지).
Phase 3 예정 잡: A5/A7/A9.

## 3. 기술 스택 (확정)

| 영역 | 선택 |
|---|---|
| 배포 | **backyard** (사내 K8s PaaS, `lab.wntd.co`) |
| 프레임워크 | Next.js 16 App Router + React 19, `output: standalone` |
| 런타임 | Node.js 20-alpine, 단일 컨테이너 |
| Cron | `node-cron` (KST), `instrumentation.ts` 부팅 시 등록 (`CRON_AUTO_ENABLED=true` 일 때만) |
| 데이터 | **Sheets (사람용 SoR)** + **Postgres (봇용 SoR)** 하이브리드. DB는 같은 backyard 프로젝트 내 `db:5432` |
| Slack | `@slack/web-api` (Bolt 미사용) |
| Sheets | `googleapis` v144 (Sheets v4) |
| 검증 | `zod` (env 파싱), `date-fns-tz` (KST) |

## 4. 디렉토리 구조 (실제 상태)

```
AX챔피언 운영/
├── docs/
│   ├── slack-channel-operations-guide.md   # 운영 가이드 마스터
│   ├── automation-implementation-plan.md   # 자동화 계획 v2
│   ├── setup-checklist.md                  # 운영진 액션 체크리스트
│   ├── PROJECT_HISTORY.md                  # Phase 단위 이력
│   ├── HANDOFF.md                          # 본 문서
│   ├── .pdca-status.json                   # bkit PDCA 상태
│   └── .bkit-memory.json
├── app/
│   ├── layout.tsx · page.tsx
│   ├── admin/                              # 빈 폴더
│   └── api/
│       ├── health/route.ts                 # health check
│       └── admin/cron/[job]/route.ts       # 수동 트리거 (Bearer + asOf 지원)
├── server/cron/
│   ├── register.ts                         # KST cron 등록
│   ├── a1-monday-announce.ts
│   ├── a3-wednesday-channel-remind.ts
│   └── a4-wednesday-finalize.ts            # ai-줍줍 7일 카운트 통합
├── lib/
│   ├── env.ts          # zod 스키마 + 검증
│   ├── schedule.ts     # 9주 캘린더 (W1 kickoff / 짝수 slack / 홀수 offline)
│   ├── db.ts           # pg pool + cron_runs 락 + scrum 기록 + audit_log
│   ├── slack.ts        # WebClient + DRY_RUN 분기 + ai-줍줍 쓰기 가드
│   ├── messages.ts     # §6 메시지 템플릿 + ai-줍줍 미달자 섹션
│   ├── sheets.ts       # raw JSON SA key 파싱 + participants/weekly_report
│   └── migrate-on-boot.ts
├── db/migrations/
│   └── 0001_init.sql   # scrum_submissions, dropout_signals, audit_log, cron_runs
├── scripts/
│   ├── migrate.ts              # tsx scripts/migrate.ts
│   ├── sync-participants.ts    # Slack 멤버 ↔ Sheets participants 머지
│   └── fire-cron.ts            # 로컬 수동 트리거
├── instrumentation.ts          # Next.js instrumentation hook (cron 등록 진입점)
├── backyard.json               # ⚠️ registry 경로가 oci.wntd.co로 적혀있지만 실제는 lab.wntd.co/proj-spv4xk/frontend 사용
├── Dockerfile                  # standalone 빌드
├── next.config.ts
├── package.json
├── .env.example                # 키 이름 갱신 (SLACK_AX_CHANNEL_ID), raw JSON SA key 주석
└── (.env.local — 2026-05-29 안전 삭제됨)
```

## 5. 데이터 모델

### Postgres (봇 SoR — `db/migrations/0001_init.sql`)
- `scrum_submissions` — 주차별 제출 기록 (`UNIQUE(week_number, slack_user_id)`)
- `dropout_signals` — 이탈 징후 (`signal_type`: scrum_2_consecutive / offline_2_consecutive / no_project_update)
- `audit_log` — 봇 발송 이력 (디버깅·재발송 방지)
- `cron_runs` — 중복 실행 방지 락 (PK: `job_name + run_slot`, slot 예: `W04-A3`)

마이그레이션은 부팅 시 `lib/migrate-on-boot.ts`가 자동 실행 → 컨테이너 새로 띄울 때마다 멱등 적용.

### Sheets (사람용 — 시트명 `AX Champion 3기 운영`, ID `1XbDRvB11wkJ5iB5b-V_v2QLeasicVm9WQ4GbNAZeLD0`)
- `participants` 탭 — 운영진 수동 관리 (헤더 10개: slackUserId, name, email, teamRound1, teamTypeRound1, teamRound2, teamTypeRound2, status, droppedAt, memo)
- `weekly_report` 탭 — 봇 자동 append (헤더 8개: weekNumber, reportDate, totalActive, scrumSubmitted, scrumMissed, offlineAttended, dropoutSignalCount, highlights)
- `offline_attendance` 탭 — 코드 미사용 (선택)

SA 권한: `ax-champion-bot-sheets@recruit-market-analysis.iam.gserviceaccount.com`에 **편집자** 권한 (5/29 부여).

## 6. 환경변수 (14개 모두 주입 완료 — 5/29)

| 변수 | 값 / 출처 |
|---|---|
| `SLACK_BOT_TOKEN` | ✅ 봇 reinstall 후 새 토큰 |
| `SLACK_SIGNING_SECRET` | ✅ 5/29 재발급 |
| `SLACK_AX_CHANNEL_ID` | ⚠️ **현재 테스트 채널 `C0A7DNYJSMU`로 임시 설정** (검증용). **운영 가동 직전에 `C0B1PCMEQBD`로 복원 + 봇 운영 채널 초대** |
| `SLACK_ADMIN_USER_ID` | `U03EK844MU2` |
| `SLACK_AI_JUBJUB_CHANNEL_ID` | `C095AKG5V7F` (5/29 추가) |
| `GOOGLE_SHEETS_ID` | `1XbDRvB11wkJ5iB5b-V_v2QLeasicVm9WQ4GbNAZeLD0` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `ax-champion-bot-sheets@recruit-market-analysis.iam.gserviceaccount.com` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | ✅ 5/29 재발급된 raw JSON (구 키 ID `c9f4b218...`는 GCP 콘솔에서 삭제 필요) |
| `DATABASE_URL` | `postgresql://app:***@db:5432/spv4xk` (backyard 자동 DB) |
| `DRY_RUN` | `true` (✅ 검증 완료, 운영 가동 시 `false` 전환 결정) |
| `CRON_AUTO_ENABLED` | `false` (수동 트리거만, 운영 가동 시 `true` 전환 결정) |
| `ADMIN_API_TOKEN` | `(backyard 시크릿에 저장 — 본 문서엔 미기재)` 5/29 생성, 64자 hex |
| `TZ` | `Asia/Seoul` |
| `PROGRAM_START_DATE` | `2026-05-11` |
| `PROGRAM_WEEKS` | `9` |

**키 이름 정합성** (5/29 통일): 코드 전체 `SLACK_AX_CHANNEL_ID` 사용 (`SLACK_CHANNEL_ID`는 폐기). `GOOGLE_SERVICE_ACCOUNT_KEY`는 **raw JSON** (base64 미사용).

## 7. backyard 인프라 상태

| 항목 | 값 |
|---|---|
| 단일 프로젝트 | `proj-spv4xk` (displayName: `ax-champion-bot`), Running |
| 컴포넌트 | frontend (이미지: `lab.wntd.co/proj-spv4xk/frontend:latest`) + postgres (DB endpoint: `db:5432`) |
| 외부 URL | `https://prj-frontend-spv4xk.lab.wntd.co` |
| auto-delete | 2026-06-18 (5/17에 +1개월 연장). 운영 종료 7/10 전 1회 더 연장 필수 |
| 현재 이미지 digest | `sha256:4eac92be645e64c76406d9512160e9575cede705ae465fb6f1c20ba35a1db7bc` (ai-줍줍 통합 버전) |
| 자동 롤아웃 | `:latest` push → webhook → 자동 롤링. webhook 누락 시 `restart_component`로 강제 트리거 |

**이전 구성**: 별도 DB 프로젝트 `proj-ejg0xc`가 있었으나 5/29 같은 프로젝트 내 DB로 통합 후 삭제.

**Docker registry 인증**: `lab.wntd.co` + `ighwoan.chun@wantedlab.com` + 사용자별 토큰 (`get_deployment_guide`로 확인 가능).

## 8. 운영진 액션 진행 상황

- ✅ Slack Bot 앱 등록 (Manifest 방식, 5/29 reinstall)
- ✅ Admin User ID 확인 (`U03EK844MU2`)
- ✅ backyard 프로젝트 (proj-spv4xk) + Postgres 통합
- ✅ Google Sheet + `participants` / `weekly_report` 탭 헤더 입력
- ✅ Google Service Account 발급 + Sheets 편집자 권한 부여
- ✅ backyard 환경변수 14개 주입 완료
- ✅ Docker 빌드 → push → 자동 롤아웃 → DB 마이그레이션 → DRY_RUN 부팅 검증

**잔여 액션 (운영 가동 직전)**:
- ⬜ `SLACK_AX_CHANNEL_ID`를 운영 채널 `C0B1PCMEQBD`로 복원
- ⬜ 봇을 `#ax-champion-3기` 채널에 초대
- ⬜ Sheets `participants` 탭에 실제 참가자 20명 데이터 채움 (또는 `scripts/sync-participants.ts` 실행)
- ⬜ `DRY_RUN=false` 전환 + (필요 시) `CRON_AUTO_ENABLED=true` 전환

## 9. 코드 검증 현황 (Phase 3 완료)

- `tsc --noEmit` → 0 에러
- Docker 빌드 → 26초 성공
- 로컬 컨테이너 health check → 200
- backyard 배포 → 성공 (digest 일치 확인)
- Postgres 마이그레이션 → 자동 실행 → 4 테이블 생성 확인
- **수동 트리거 dry-run 검증**:
  - A1 W4 → 본인 DM 슬랙 안내 도착 ✅
  - A3 W2 → 본인 DM "no active participants" 안내 ✅
  - A4 W2 → 본인 DM 마감 요약 + Sheets weekly_report append + scrum_submissions 0건 기록 ✅

검증 보류 (실데이터 시점에 가능):
- ai-줍줍 실제 카운트 동작 (현재 active=0이라 코드 분기에서 skip)
- 슬랙 채널 실제 발송 (DRY_RUN=true)

## 10. 보안 사고 — 노출 자산 (5/11~5/29)

backyard MCP가 시크릿/패스워드를 마스킹 없이 평문 반환 + 사용자가 일부 파일을 선택 공유 → Claude Code 컨텍스트/로컬 캐시에 평문 누적.

| 자산 | 상태 |
|---|---|
| Slack Bot Token | Slack 회전 미지원 정책상 스킵 (워크스페이스 한정 위험, 사용자 macOS만 노출) |
| Slack Signing Secret | ✅ 5/29 재발급 |
| GCP SA private key (구 ID `c9f4b218...`) | ✅ 5/29 새 키 발급. **구 키는 GCP 콘솔에서 수동 삭제 필요** |
| 구 Postgres password (`proj-ejg0xc`) | ✅ 프로젝트 삭제로 폐기 |
| 신규 Postgres password (`proj-spv4xk` 내부 DB) | ⏳ 운영 종료 후 회전 |
| backyard MCP 토큰 (5/11 노출 + 5/29 list_secrets 추가) | ⏳ 운영 종료 후 재발급 |
| Docker registry 토큰 (deployment guide 응답에서 노출) | ⏳ backyard MCP 토큰과 함께 처리 |
| `.env.local` 평문 파일 | ✅ 5/29 `rm -P`로 삭제 (단, APFS copy-on-write 특성상 secure delete 보장 X — 실효 위험은 외부 접근 차단에 달림) |

**원칙**: 잔여 자산은 운영 중단 회피를 위해 운영 종료(7/10) 후 일괄 회전. 그 사이 backyard MCP 토큰 노출은 본인 계정 한정.

## 11. 잔여 미해결 이슈

1. **`backyard.json` registry 경로 불일치** — `oci.wntd.co/backyard/ax-champion-bot`로 적혀 있으나 실제 동작 경로는 `lab.wntd.co/proj-spv4xk/frontend`. 혼란 방지 위해 정정 권장. (지금 가동에는 영향 없음)
2. **A4 코드 개선 후보** — `active.length === 0`일 때도 `listChannelMembers` 호출하면서 봇 채널 멤버십 의존. early return으로 0/0 처리하는 게 robust. 운영 채널 멤버 항상 보장되면 무시 가능.
3. **`cron_runs` 테이블에 5/29 검증으로 잡힌 슬롯들** — `W02-A1`, `W04-A1`, `W04-A3`, `W04-A4`, `W06-A3`, `W06-A4`, `W08-A3`, `W08-A4`. 실제 운영 W2~W8 자동 발화 시 이 슬롯들은 skip됨. **운영 가동 직전 또는 첫 자동 발화 전에 cron_runs 전체 DELETE 필요**: `DELETE FROM cron_runs;`
4. **`SLACK_AX_CHANNEL_ID` 테스트 채널 상태** — 운영 가동 직전에 `C0B1PCMEQBD`로 복원 필수.
5. **W4 슬롯 미스터리 락** — 디버깅 시 발견된 정체불명 5/17:12 시점 락. 위 §11-3 cron_runs DELETE로 자연 해결.

## 12. 다음 액션 (운영 가동 흐름)

### A. 운영 가동 직전 (W4 시작 6/1 전)
1. `cron_runs` 테이블 비우기: `mcp__backyard__db_query` `DELETE FROM cron_runs;`
2. `SLACK_AX_CHANNEL_ID` 복원: `mcp__backyard__upsert_secret` key=`SLACK_AX_CHANNEL_ID` value=`C0B1PCMEQBD`
3. 봇을 `#ax-champion-3기` 채널에 초대 (`/invite @AX챔피언운영봇`)
4. Sheets `participants` 탭에 20명 데이터 채움 (수동 또는 `npx tsx scripts/sync-participants.ts` — 단 채널 멤버 기반)
5. (선택) `mcp__backyard__extend_autodelete` proj-spv4xk + reason `"운영 종료까지"` — 6/18 → 7월 말로 연장

### B. 가동 전환 (운영진 결정)
6. `DRY_RUN=false` 전환: `upsert_secret DRY_RUN false`
7. `CRON_AUTO_ENABLED=true` 전환: `upsert_secret CRON_AUTO_ENABLED true` (수동 트리거 유지하려면 false 유지 가능)

### C. 운영 종료 후 (7/10 이후)
8. backyard MCP 토큰 + Docker registry 토큰 + Postgres password 일괄 회전
9. 구 GCP SA key (`c9f4b218...`) GCP 콘솔에서 삭제
10. `backyard.json` registry 경로 정정 (`lab.wntd.co/proj-spv4xk/frontend`로)

## 13. 핵심 참고 문서 (이 순서로 읽기)

1. `docs/PROJECT_HISTORY.md` — Phase 단위 이력 (가장 빠른 컨텍스트 파악)
2. `docs/automation-implementation-plan.md` — 자동화 마스터 플랜
3. `docs/setup-checklist.md` — 운영진 액션 + 수동 트리거 사용법
4. `docs/slack-channel-operations-guide.md` — 운영 가이드 본체 (메시지 템플릿 §6)
5. `lib/schedule.ts` — 9주 캘린더 분기 로직
6. `db/migrations/0001_init.sql` — Postgres 스키마

## 14. 의사결정 메모 (확정)

- A3 미제출자 안내는 **DM이 아닌 공개 채널 멘션** ("다같이 하는 분위기")
- Cron은 **단일 컨테이너 + node-cron** (backyard에 Scheduled Job 기능 없음)
- 중복 방지는 `cron_runs(job_name, run_slot)` UNIQUE 락
- 수동 트리거가 1차 가동 모드. `CRON_AUTO_ENABLED=true`는 검증 완료 후 운영진 결정
- `?asOf=ISO8601`로 가상 일자 주입 → 스케줄 분기 검증
- `DRY_RUN=true`는 채널 발송 차단, 모든 출력을 운영진 DM으로
- **ai-줍줍 = 참가자 자발적 게시 (주 2건), 봇은 read-only 트래킹**. 운영진 게시 대행 아님. 코드 가드(`lib/slack.ts` postMessage)로 강제.
- 보안 자산 회전은 운영 종료 후 일괄 처리 (운영 중단 회피 우선)

---

**다음 세션 시작 지점**: §12 A부터 (운영 가동 직전 절차).
