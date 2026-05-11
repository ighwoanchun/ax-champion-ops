# 주간 운영 자동화 — 구현 계획 (v2, backyard 기반)

> 운영진 1인이 9주간 #ax-champion-3기 (`C0B1PCMEQBD`) 채널을 혼자 운영할 수 있도록,
> `slack-channel-operations-guide.md` §2 주간 루틴과 §6 메시지 템플릿을 자동화한다.
>
> **v2 변경:** Vercel → **backyard (사내 K8s PaaS)**, Sheets-only → **Sheets + Postgres 하이브리드**,
> A3 미제출자 DM → **공개 채널 멘션 안내**

---

## 1. 목적 및 범위

### 1-1. 목적

- 운영진의 **반복 작업 시간 → 0에 수렴**
- 운영진의 **판단 작업 시간 → 의사결정과 1:1 케어에 집중**
- "운영진이 직접 AI를 쓰는 모습"을 자동화 시스템 자체로 보여주기

### 1-2. 범위 (In / Out)

**In Scope:**
- 슬랙 채널 안내·리마인드 메시지 자동 발송
- 슬랙 스크럼 제출 현황 자동 추적
- 미제출자 자동 식별 + **채널 멘션 안내**
- 이탈 징후 자동 감지 + 운영진 알림
- ai-줍줍 큐레이션 후보 자동 추천
- 주간 운영 리포트 자동 생성

**Out of Scope (운영진 수동):**
- 1:1 미팅 진행, 1:1 이탈 케어 DM (`§6-I` 유지)
- 의사결정 (이탈 처리, 팀 재편성)
- ai-줍줍 최종 게시 (큐레이션은 자동, 게시 승인은 수동)
- 오프라인 공유회 진행

---

## 2. 가이드 → 자동화 매핑

| # | 가이드 항목 | 트리거 | 자동화 형태 | 우선순위 |
| --- | --- | --- | --- | --- |
| **A1** | 월 09:00 채널 안내 (§6-A/B) | Cron Mon 09:00 | 메시지 자동 게시 (오프라인/슬랙 판별) | **MVP** |
| A2 | 수 10:00 운영진 스크럼 선도 | Cron Wed 10:00 (슬랙 주차) | 양식 자동 게시 | Phase 2 |
| **A3** | 수 15:00 미제출자 안내 — **채널 멘션 방식** | Cron Wed 15:00 (슬랙 주차) | 채널 메시지 스캔 → 미제출자 멘션 + 가벼운 안내 | **MVP** |
| **A4** | 수 18:00 마감 + 트래킹 | Cron Wed 18:00 (슬랙 주차) | 제출 현황 Postgres 기록 + Sheets 미러링 | **MVP** |
| A5 | 수 D-1시간 1시간 전 리마인드 | Cron Wed 13:00 (오프라인 주차) | 메시지 자동 게시 | Phase 3 |
| A6 | 금 16:00 주간 리포트 | Cron Fri 16:00 | 출석·스크럼·이탈 종합 → 운영진 DM | Phase 2 |
| A7 | 금 ai-줍줍 큐레이션 후보 | Cron Fri 14:00 | LLM 큐레이션 → 운영진 DM | Phase 3 |
| A8 | 이탈 징후 감지 | A4 결과 누적 | 2회 연속 미제출 → 운영진 DM | Phase 2 |
| A9 | 신규 멤버 환영 | Slack 이벤트 | DM 환영 + 가이드 링크 | Phase 3 |

---

## 3. 우선순위 — MVP / Phase 2 / Phase 3

### MVP (마감 **2026-05-08**, W1 시작 전)

핵심 가치: **"매주 수요일이 빠지지 않게 한다"**

| # | 기능 | 비고 |
| --- | --- | --- |
| A1 | 월 오전 채널 안내 발송 | 까먹으면 그 주가 통째로 망가짐 |
| **A3 (변경)** | **수 15시 채널에 미제출자 멘션 + 가벼운 안내** | 개별 DM이 아닌 공개 채널 멘션. "다같이 하는 분위기" 형성 |
| A4 | 수 18시 트래킹 기록 (Postgres + Sheets) | A6/A8 데이터 기반 |

### Phase 2 (W2~W3 안정화 후)

A6 (주간 리포트) · A8 (이탈 징후) · A2 (수요일 운영진 선도)

### Phase 3 (시간 여유 시)

A5 · A7 · A9

---

## 4. 기술 스택 (v2 확정)

### 4-1. 인프라

| 영역 | 선택 | 비고 |
| --- | --- | --- |
| **배포** | **backyard** (사내 K8s PaaS) | sales-flow 등 검증된 사내 환경 |
| **컨테이너 이미지 레지스트리** | `oci.wntd.co/backyard/ax-champion-bot` | |
| **호스팅 도메인 (예상)** | `https://ax-champion-bot.labs.wntd.co` | 운영진 어드민 페이지 노출 |
| **프레임워크** | **Next.js (App Router)** | 사내 표준 (sales-flow, jd-copilot) |
| **런타임** | Node.js 20-alpine | backyard 표준 Dockerfile |
| **컨테이너 형상** | Pod 1개 (단일 인스턴스) | node-cron 중복 실행 방지 |

### 4-2. Cron 전략 — 옵션 A (단일 컨테이너 + node-cron) + 수동 트리거 모드

backyard 자체에 Scheduled Job 기능이 없으므로, **Next.js 컨테이너 내부에서 `node-cron` 으로 스케줄링**.

**가동 모드 (운영진 결정):**

| `CRON_AUTO_ENABLED` | 동작 |
| --- | --- |
| **`false` (기본)** | 자동 등록 SKIP. **수동 트리거 endpoint 만 발화** — `POST /api/admin/cron/{A1\|A3\|A4}` |
| `true` | KST 기준 자동 발화 (아래 스케줄) |

```
[자동 모드, CRON_AUTO_ENABLED=true]
 └─ node-cron 워커 — instrumentation.ts 부팅 시 등록
     ├─ "0 9 * * 1"  Asia/Seoul → A1 (월 안내)
     ├─ "0 15 * * 3" Asia/Seoul → A3 (수 15시 채널 안내)
     └─ "0 18 * * 3" Asia/Seoul → A4 (수 18시 마감·트래킹)

[수동 모드, CRON_AUTO_ENABLED=false]
 └─ POST /api/admin/cron/{A1|A3|A4}  ← 운영진이 직접 호출
     · Authorization: Bearer <ADMIN_API_TOKEN>
     · ?asOf=ISO8601 로 가상 일자 주입 가능 (분기 검증용)
```

**중복 실행 방지 (안전장치):**
- backyard Pod 가 1개 가정. 미래에 Replica 가 늘어나면 PostgreSQL `advisory lock` 으로 락 처리
- 각 Cron 핸들러 시작 시 `cron_runs` 테이블에 `(job_name, run_slot)` UNIQUE INSERT — 같은 슬롯 중복 발사 차단 (수동 트리거도 동일 적용)

### 4-3. 데이터 저장소 (하이브리드 확정)

| 데이터 | 위치 | 누가 만짐 | 사유 |
| --- | --- | --- | --- |
| `participants` (명단) | **📊 Sheets** | 운영진 직접 | 합/불·팀 편성·이탈 처리 손으로 |
| `offline_attendance` (오프라인 출석) | **📊 Sheets** | 운영진 직접 | 사진 보고 체크 입력 |
| `weekly_report` (주간 요약) | **📊 Sheets** | 봇이 쓰고 운영진이 봄 | 가시성 최우선 |
| `scrum_submissions` (수 18시 시점 기록) | **🐘 Postgres** | 봇만 | 트랜잭션·시점성 |
| `dropout_signals` (이탈 징후) | **🐘 Postgres** | 봇이 씀, 운영진은 알림으로 봄 | 누적 분석 |
| `audit_log` (봇 발송 이력) | **🐘 Postgres** | 봇만 | 디버깅·재발송 방지 |
| `cron_runs` (Cron 실행 기록) | **🐘 Postgres** | 봇만 | 중복 실행 방지 락 |

**Postgres = 신뢰 가능한 저장소 (SoR for 봇), Sheets = 사람이 보는 뷰 (SoR for 운영진).** 일부 데이터는 Postgres → Sheets 단방향 미러링.

### 4-4. 외부 SDK / API

| 라이브러리 | 용도 |
| --- | --- |
| `@slack/bolt` | Slack Bot SDK (Express receiver 모드) |
| `@slack/web-api` | Cron 핸들러에서 직접 호출용 (간결) |
| `node-cron` | Cron 스케줄링 |
| `googleapis` (Sheets v4) | Sheets 미러링 |
| `pg` 또는 `postgres` | PostgreSQL 클라이언트 |
| `drizzle-orm` (선택) | 스키마·마이그레이션 (사용자 익숙도에 따라) |
| `date-fns-tz` | KST 타임존 처리 |

---

## 5. 데이터 모델

### 5-1. Sheets 탭 구조 (운영진 뷰)

**시트 이름:** `AX Champion 3기 운영`

#### 탭 1: `participants` (운영진 직접 입력/편집)

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| slack_user_id | string | DM/멘션 키. 봇 시작 시 슬랙 채널 멤버로 자동 채움 |
| name | string | 한국어 이름 |
| email | string | wantedlab 이메일 |
| team_round1 | string | 5월 라운드 팀명 |
| team_type_round1 | enum | maker / growth |
| team_round2 | string | 6월 라운드 팀명 (W5 이후) |
| team_type_round2 | enum | maker / growth |
| status | enum | active / dropped |
| dropped_at | date | 이탈 처리일 |
| memo | string | 운영진 메모 |

#### 탭 2: `offline_attendance` (운영진 직접 체크)

| 컬럼 | 타입 |
| --- | --- |
| week_number | int (1~9) |
| meet_date | date |
| slack_user_id | string |
| attended | boolean |

#### 탭 3: `weekly_report` (봇 자동 갱신, 운영진 열람)

매주 금요일 16시 봇이 마지막 행에 추가:

| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| week_number | int | |
| report_date | date | |
| total_active | int | participants 중 active |
| scrum_submitted | int | 슬랙 주차 제출자 수 |
| scrum_missed | int | 미제출자 수 |
| offline_attended | int | 오프라인 주차 출석자 수 |
| dropout_signal_count | int | 신규 이탈 징후 |
| highlights | string | LLM이 뽑은 인상적 사례 1줄 (Phase 3) |

### 5-2. Postgres 스키마 (자동화 SoR)

```sql
-- 5-2-1. 슬랙 스크럼 제출 기록
CREATE TABLE scrum_submissions (
  id              BIGSERIAL PRIMARY KEY,
  week_number     INT NOT NULL,
  scrum_date      DATE NOT NULL,
  slack_user_id   TEXT NOT NULL,
  submitted       BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at    TIMESTAMPTZ,
  message_ts      TEXT,                 -- Slack message timestamp
  has_blocker     BOOLEAN,              -- "🚧 막힌 것" 섹션 보유 여부
  raw_text        TEXT,                 -- 원본 메시지 (디버깅용)
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (week_number, slack_user_id)
);

-- 5-2-2. 이탈 징후
CREATE TABLE dropout_signals (
  id              BIGSERIAL PRIMARY KEY,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  slack_user_id   TEXT NOT NULL,
  signal_type     TEXT NOT NULL,        -- scrum_2_consecutive / offline_2_consecutive / no_project_update
  context         JSONB,                -- 어느 주차 미제출인지 등 상세
  notified_to_admin BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  resolution      TEXT                  -- care_done / dropped / false_positive
);

-- 5-2-3. 봇 발송 감사 로그
CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_name        TEXT NOT NULL,        -- A1 / A3 / A4 ...
  channel_id      TEXT,
  message_ts      TEXT,
  payload         JSONB,
  status          TEXT NOT NULL,        -- success / dry_run / error
  error_message   TEXT
);

-- 5-2-4. Cron 중복 실행 방지
CREATE TABLE cron_runs (
  job_name        TEXT NOT NULL,
  run_slot        TEXT NOT NULL,        -- ex: '2026-W19-A1' (week-bound idempotency key)
  fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_name, run_slot)
);

CREATE INDEX idx_scrum_user_week ON scrum_submissions(slack_user_id, week_number);
CREATE INDEX idx_dropout_unresolved ON dropout_signals(slack_user_id) WHERE resolved_at IS NULL;
```

---

## 6. Slack Bot 권한

### 6-1. Bot Token Scopes

| Scope | 용도 |
| --- | --- |
| `chat:write` | 채널 메시지 게시 (A1, A3) |
| `chat:write.public` | 가입 안 된 채널에도 가능 (선택) |
| `im:write` | 운영진 DM 발송 (A6, A8 알림) |
| `users:read` | 멤버 목록 조회 |
| `users:read.email` | 이메일 매칭 (Sheets 동기화) |
| `channels:history` | 채널 메시지 스캔 (A3, A7) |
| `channels:read` | 채널 멤버 조회 (`conversations.members`) |
| `reactions:read` | A7 큐레이션 신호 (Phase 3) |

### 6-2. 운영진 사전 작업 (사용자 액션)

별도 문서 `setup-checklist.md` 참조.

---

## 7. 환경 / 디렉토리 구조

### 7-1. 디렉토리 구조

```
AX챔피언 운영/
├── docs/
│   ├── slack-channel-operations-guide.md
│   ├── automation-implementation-plan.md   # 본 문서
│   ├── setup-checklist.md                  # 사용자 액션 체크리스트
│   └── PROJECT_HISTORY.md
├── app/                                    # Next.js App Router
│   ├── api/
│   │   └── slack/events/route.ts           # Phase 3
│   ├── admin/
│   │   ├── page.tsx                        # 운영진 대시보드
│   │   └── layout.tsx
│   └── layout.tsx
├── server/                                 # Custom server entry
│   ├── index.ts                            # next + node-cron 동시 기동
│   └── cron/
│       ├── register.ts                     # 모든 잡 등록
│       ├── a1-monday-announce.ts
│       ├── a3-wednesday-channel-remind.ts  # MVP — 채널 멘션 방식
│       └── a4-wednesday-finalize.ts        # MVP
├── lib/
│   ├── slack.ts                            # WebClient wrapper
│   ├── sheets.ts                           # Google Sheets 클라이언트
│   ├── db.ts                               # Postgres 클라이언트
│   ├── schedule.ts                         # 9주 캘린더 (오프라인/슬랙 판별)
│   ├── messages.ts                         # §6 템플릿 (placeholder 치환)
│   └── env.ts                              # 환경변수 파싱·검증 (zod)
├── db/
│   └── migrations/
│       └── 0001_init.sql                   # §5-2 스키마
├── scripts/
│   ├── migrate.ts                          # 마이그레이션 실행기
│   └── sync-participants.ts                # Sheets ↔ Slack 멤버 동기화
├── backyard.json                           # 배포 설정
├── Dockerfile                              # backyard 표준 (Next.js standalone)
├── next.config.ts                          # output: 'standalone'
├── package.json
└── .env.example
```

### 7-2. 환경 변수 (backyard `환경 변수` 탭에 주입)

| 변수 | 용도 |
| --- | --- |
| `SLACK_BOT_TOKEN` | xoxb- |
| `SLACK_SIGNING_SECRET` | events 검증 (Phase 3) |
| `SLACK_CHANNEL_ID` | `C0B1PCMEQBD` |
| `SLACK_ADMIN_USER_ID` | 운영진 본인 Slack User ID (DM 알림 수신) |
| `GOOGLE_SHEETS_ID` | Sheets 문서 ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service Account 이메일 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | base64 인코딩된 private key (JSON 통째로) |
| `DATABASE_URL` | `postgres://...` (backyard postgresql 템플릿) |
| `DRY_RUN` | `true` / `false`. true 면 모든 발송이 운영진 DM 으로만 |
| **`CRON_AUTO_ENABLED`** | `true` / `false`. **기본 false** — 자동 cron 비활성, 수동 트리거만 발화 |
| **`ADMIN_API_TOKEN`** | **수동 트리거 endpoint 인증 토큰** (16자+ 임의 문자열) |
| `TZ` | `Asia/Seoul` |
| `PROGRAM_START_DATE` | `2026-05-11` (W1 월요일) |
| `PROGRAM_WEEKS` | `9` |

### 7-3. Dry-run 모드

`DRY_RUN=true` 환경변수로 **공개 채널 게시·DM 발송 없이 운영진 본인 채널/DM 으로만 미리보기**.
- W1 시작 전(5/9~5/10) 1~2일간 dry-run 으로 검증
- W1 시작일에 `DRY_RUN=false` 로 전환 (backyard 환경 변수 탭에서 변경 → 재시작)

---

## 8. A3 — 채널 미제출자 멘션 안내 (MVP 상세)

> **변경 사항:** 기존 §6-D (개별 DM) → **공개 채널 멘션 안내**. 미제출자만 멘션, 톤은 가볍게.

### 8-1. 동작

1. (수 슬랙 주차) 15:00 KST `node-cron` 발화
2. `cron_runs` UNIQUE 락 시도 → 이미 발사됐으면 종료
3. Slack `conversations.members` 로 채널 멤버 조회 (봇 자신 제외)
4. Slack `conversations.history` 로 당일 00:00 이후 메시지 조회
5. 메시지 텍스트가 `📌 위클리 스크럼` 으로 시작하는 발송자 → 제출자
6. `participants` (Sheets) 의 `status=active` 인 사람 ∩ 채널 멤버 - 제출자 = **미제출자**
7. 미제출자 0명이면 채널에 "이번 주 전원 제출 완료 🎉" 게시 후 종료
8. 1명 이상이면 아래 메시지 게시
9. `audit_log` 에 결과 기록

### 8-2. 메시지 템플릿 (§6-D')

```
📌 위클리 스크럼 미제출자 안내

<@U001> <@U002> <@U003>

오늘 18시까지 위 양식으로 스크럼 부탁드립니다 🙏
막힌 부분이 있으면 그것만 적어주셔도 충분합니다.

📋 양식
✅ 지난 2주간 한 것
🎯 다음 2주간 할 것
🚧 막힌 것 / 도움 필요
```

원칙:
- 미제출자만 멘션 (제출자는 알림 X)
- 비난 톤 X, "막힌 것만 적어도 OK" 출구 제시
- DM 보충 없음 (운영진 수동 영역)

### 8-3. 실패 모드 / 엣지 케이스

| 상황 | 처리 |
| --- | --- |
| 슬랙 API 일시 오류 | 5분 후 1회 재시도 (지수 백오프 1회만) |
| 오프라인 주차에 잘못 발화 | `lib/schedule.ts` 가 즉시 종료 (오프라인 주차에는 A3 비활성) |
| `participants` Sheets 비어 있음 | 운영진 DM 으로 경고 + 종료 |
| 미제출자 ≥ 절반 (10명+) | 운영진 DM 으로 경고 ("절반 이상 미제출, 메시지 발송 보류 OK?") — Phase 2 |

---

## 9. 의사결정 결과 (확정)

| Q | 답변 |
| --- | --- |
| Q1. Slack Bot 가능? | ✅ 가능 |
| Q2. Sheets Service Account 가능? | ✅ 가능 |
| Q3. 배포 환경 | ✅ **backyard** (사내 K8s PaaS) |
| Q4. MVP 범위 + 마감 | ✅ A1 + **A3 (채널 멘션 안내)** + A4 / **마감 2026-05-08** |
| Q5. 봇 이름 | ✅ "AX 챔피언 운영봇" |
| Q6. Dry-run 1주 | ✅ OK (5/9~5/10 dry-run, 5/11 본격 가동) |
| D1. Cron 전략 | ✅ 단일 컨테이너 + node-cron |
| D2. 데이터 저장소 | ✅ Sheets + Postgres 하이브리드 |
| D3. (Q4 동일) | ✅ |

---

## 10. 다음 단계 — 5/7 → 5/8 마감

### 10-1. 사용자 액션 (병렬 진행, 별도 문서 `setup-checklist.md`)

1. **Slack Bot 앱 등록** + 토큰 발급 (워크스페이스 관리자 승인 필요)
2. **backyard 프로젝트 생성** (`labs.wntd.co` 에서 `ax-champion-bot`)
3. **backyard PostgreSQL 템플릿 추가** (`ax-champion-bot-db`)
4. **Google Sheet 1개 생성** + 3개 탭(`participants`, `offline_attendance`, `weekly_report`) 헤더 행 작성
5. **Service Account 발급** + Sheet 편집 권한 공유
6. **운영진 본인 Slack User ID 확인** (`SLACK_ADMIN_USER_ID` 용)

### 10-2. 코드 작업 (내가 즉시 진행)

| 순서 | 작업 |
| --- | --- |
| 1 | 디렉토리 스캐폴딩 (`backyard.json`, Next.js, Dockerfile) |
| 2 | `lib/env.ts` (zod 스키마) + `.env.example` |
| 3 | `lib/db.ts` + `db/migrations/0001_init.sql` |
| 4 | `lib/sheets.ts` |
| 5 | `lib/slack.ts` + `lib/messages.ts` + `lib/schedule.ts` |
| 6 | `server/cron/a1-monday-announce.ts` |
| 7 | `server/cron/a3-wednesday-channel-remind.ts` |
| 8 | `server/cron/a4-wednesday-finalize.ts` |
| 9 | `server/index.ts` (custom server + node-cron 등록) |
| 10 | `scripts/sync-participants.ts` (초기 멤버 동기화) |
| 11 | 로컬 docker build 검증 |
| 12 | backyard 배포 (`/backyard-deploy`) + dry-run |

---

## 11. 비고

- 본 v2 계획은 사용자 D1~D3 답변(2026-05-07) 반영본
- Phase 2/3 항목은 MVP 가동 안정화 후 별도 갱신
- 변경 시 `PROJECT_HISTORY.md` Phase 추가
