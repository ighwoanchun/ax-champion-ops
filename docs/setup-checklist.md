# 사용자 액션 체크리스트 — 5/7 → 5/8 마감

> 자동화 MVP(A1+A3+A4) 가동을 위해 **운영진(사용자)이 직접 처리해야 하는 환경 셋업** 모음.
> 코드 작업과 병렬 진행 가능. 5/8 안에 모두 완료.
>
> 항목별 완료 시 결과(토큰·ID·URL 등)를 운영진 본인 Slack DM 또는 메모장에 잠시 보관 → 한 번에 backyard `환경 변수` 탭에 주입.

---

## ✅ 체크리스트 한눈에

- [ ] **1. Slack Bot 앱 등록** (워크스페이스 관리자 승인 필요 — 가장 큰 변수)
- [ ] **2. Slack Bot 권한 부여 + 채널 초대**
- [ ] **3. 운영진 본인 Slack User ID 확인**
- [ ] **4. backyard 프로젝트 생성** (`ax-champion-bot`)
- [ ] **5. backyard PostgreSQL 템플릿 추가** (`ax-champion-bot-db`)
- [ ] **6. Google Sheet 생성 + 3개 탭 헤더 입력**
- [ ] **7. Google Cloud Service Account 발급 + Sheet 편집 권한 공유**
- [ ] **8. 위 결과(토큰·ID 등)를 backyard `환경 변수` 탭에 주입**

---

## 1. Slack Bot 앱 등록

### 1-1. 앱 생성

1. https://api.slack.com/apps 접속 → **Create New App** → **From scratch**
2. 앱 이름: `AX 챔피언 운영봇`
3. 워크스페이스: `wantedlab`
4. 생성 버튼

### 1-2. 권한 추가 (OAuth & Permissions)

좌측 메뉴 **OAuth & Permissions** → **Bot Token Scopes** 에 아래 8개 추가:

| Scope | 용도 |
| --- | --- |
| `chat:write` | 채널 메시지 발송 |
| `chat:write.public` | 미초대 채널에도 발송 가능 (선택, 안전을 위해 권장) |
| `im:write` | 운영진 DM 알림 발송 |
| `users:read` | 멤버 목록 조회 |
| `users:read.email` | 이메일 매칭 |
| `channels:history` | 채널 메시지 스캔 (미제출자 식별) |
| `channels:read` | 채널 멤버 조회 |
| `reactions:read` | (Phase 3) ai-줍줍 큐레이션 |

### 1-3. 워크스페이스 설치

1. 같은 페이지 상단 **Install to Workspace** 클릭
2. **워크스페이스 관리자 승인이 필요할 수 있음** — 미리 메신저로 요청 (`AX Champion Program 운영 자동화용 봇 앱 승인 부탁드립니다`)
3. 승인 후 발급되는 **Bot User OAuth Token** (`xoxb-...`) 저장 → `SLACK_BOT_TOKEN`
4. 좌측 **Basic Information** → **App-Level Tokens** 아래 **Signing Secret** 복사 → `SLACK_SIGNING_SECRET`

### 1-4. 봇 표시명 / 아이콘 (선택)

좌측 **App Home** → **Display Name (Bot Name)**: `AX 챔피언 운영봇`
**Default username**: `ax-champion-bot`

> 🟢 **완료 산출물:** `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`

---

## 2. Slack Bot 권한 부여 + 채널 초대

### 2-1. 채널에 봇 초대

`#ax-champion-3기` 채널에서:
```
/invite @AX 챔피언 운영봇
```

### 2-2. ai-줍줍 채널 (Phase 3 대비, 지금 해두면 편함)

`#ai-줍줍` 채널에서도 동일하게 초대.

> 🟢 **완료 산출물:** 봇이 두 채널에 표시됨

---

## 3. 운영진 본인 Slack User ID 확인

운영진 본인 프로필 → **More** (`...`) → **Copy member ID** → `U` 로 시작하는 11자리.

> 🟢 **완료 산출물:** `SLACK_ADMIN_USER_ID` (예: `U03ABC1234D`)

---

## 4. backyard 프로젝트 생성

1. https://labs.wntd.co 접속
2. **새 프로젝트** → 템플릿 **`web-app`** 선택
3. 프로젝트 이름: `ax-champion-bot`
4. 생성 후 대시보드 URL 확인 (예: `https://ax-champion-bot.labs.wntd.co`)

이 시점에는 컨테이너가 비어 있어서 Pod이 떠도 페이지가 안 뜸 — 정상. 이후 코드 push 하면 자동 배포.

> 🟢 **완료 산출물:** backyard 대시보드에 `ax-champion-bot` 프로젝트 보임

---

## 5. backyard PostgreSQL 템플릿 추가

1. 같은 대시보드에서 **새 리소스** → 템플릿 **`postgresql`** 선택
2. 이름: `ax-champion-bot-db`
3. (가능하면) Storage: `1Gi` 이하로 충분 — 9주 운영 + 20명 + 텍스트 데이터
4. 생성 후 자동 주입되는 환경변수 확인:
   - `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST` 등
   - 또는 직접 `DATABASE_URL` 형태 노출 여부

> 💡 sales-flow 사례에서 Pod 이름 `sales-flow-db-575db9b5bf-4zcn4`, 서비스 주소 `sales-flow-db.backyard-apps.svc.cluster.local:5432` 였음. 같은 패턴이면:
>
> ```
> DATABASE_URL=postgres://[USER]:[PASSWORD]@ax-champion-bot-db.backyard-apps.svc.cluster.local:5432/[DB]
> ```
>
> → backyard 가 자동 주입해주는지 / 직접 조립해야 하는지 대시보드에서 확인 부탁드립니다.

> 🟢 **완료 산출물:** Postgres 인스턴스 + `DATABASE_URL` 또는 `POSTGRES_*` 환경변수 셋

---

## 6. Google Sheet 생성 + 헤더 입력

### 6-1. Sheet 생성

1. https://sheets.google.com 에서 새 스프레드시트 생성
2. 제목: `AX Champion 3기 운영`
3. URL 의 `/d/` 다음 ID 부분 복사 → `GOOGLE_SHEETS_ID`
   ```
   https://docs.google.com/spreadsheets/d/[이 부분]/edit
   ```

### 6-2. 탭 3개 생성 + 헤더 입력

각 탭 첫 행에 헤더만 입력. 데이터는 비워둠.

#### 탭 1: `participants`

```
slack_user_id | name | email | team_round1 | team_type_round1 | team_round2 | team_type_round2 | status | dropped_at | memo
```

`status` 컬럼 데이터 검증 (선택): `active` / `dropped` 만 허용
`team_type_*` 컬럼 데이터 검증 (선택): `maker` / `growth` 만 허용

> 💡 합격자 명단은 6-2 완료 후 운영진이 직접 입력하거나, 코드 작업 11번 `sync-participants.ts` 가 Slack 채널 멤버를 가져와 자동 채움. 둘 다 가능.

#### 탭 2: `offline_attendance`

```
week_number | meet_date | slack_user_id | attended
```

#### 탭 3: `weekly_report`

```
week_number | report_date | total_active | scrum_submitted | scrum_missed | offline_attended | dropout_signal_count | highlights
```

> 🟢 **완료 산출물:** `GOOGLE_SHEETS_ID`

---

## 7. Google Cloud Service Account

### 7-1. 프로젝트 생성/선택

1. https://console.cloud.google.com 접속
2. 사내 wantedlab 조직 산하에 기존 프로젝트 사용 또는 신규 `ax-champion-bot` 프로젝트 생성

### 7-2. Sheets API 활성화

상단 검색 `Google Sheets API` → **사용 설정**

### 7-3. Service Account 생성

1. **IAM 및 관리자** → **서비스 계정** → **서비스 계정 만들기**
2. 이름: `ax-champion-bot-sheets`
3. 역할: 부여 안 함 (Sheet 단위 권한으로 충분)
4. 생성 후 **키 만들기** → **JSON** → 파일 다운로드
5. 다운로드된 JSON 안에서 두 값 추출:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → 그대로는 줄바꿈 처리가 까다로워서, **JSON 파일 전체를 base64 인코딩** 한 값을 `GOOGLE_SERVICE_ACCOUNT_KEY` 로 사용 권장

```bash
# 로컬에서 실행 (macOS):
base64 < ~/Downloads/ax-champion-bot-xxx.json | pbcopy
```

→ `GOOGLE_SERVICE_ACCOUNT_KEY` 값으로 클립보드에 복사됨.

### 7-4. Sheet 에 Service Account 권한 부여

1. 6-1에서 만든 Sheet 열기 → 우측 상단 **공유**
2. `client_email` (예: `ax-champion-bot-sheets@...iam.gserviceaccount.com`) 입력
3. 권한 **편집자** 선택 → 공유

> 🟢 **완료 산출물:** `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY` (base64)

---

## 8. backyard `환경 변수` 탭에 주입

`ax-champion-bot` 프로젝트 → **환경 변수** 탭 → 아래 변수들 추가:

| 변수 | 값 | 출처 |
| --- | --- | --- |
| `SLACK_BOT_TOKEN` | xoxb-... | §1-3 |
| `SLACK_SIGNING_SECRET` | ... | §1-3 |
| `SLACK_CHANNEL_ID` | `C0B1PCMEQBD` | 채널 ID |
| `SLACK_ADMIN_USER_ID` | `U03EK844MU2` | §3 |
| `GOOGLE_SHEETS_ID` | ... | §6-1 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ...@...iam.gserviceaccount.com | §7-3 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | (base64) | §7-3 |
| `DATABASE_URL` | postgres://USER:PASS@ax-champion-bot-db.backyard-apps.svc.cluster.local:5432/DB | §5 |
| `DRY_RUN` | `true` | 검증 동안 true, 운영 가동 시점에 false |
| **`CRON_AUTO_ENABLED`** | **`false`** | **자동 cron 비활성** (수동 트리거만 발화). 검증 끝난 후 운영진 결정으로 true 전환 |
| **`ADMIN_API_TOKEN`** | **임의 문자열 16자+** | 수동 트리거 엔드포인트 인증용. 생성: `openssl rand -hex 32` |
| `TZ` | `Asia/Seoul` | 고정 |
| `PROGRAM_START_DATE` | `2026-05-11` | 3기 W1 월요일 |
| `PROGRAM_WEEKS` | `9` | |

저장 후 컨테이너 재시작 (대시보드 우측 상단 **재시작** 버튼).

---

## 9. 수동 Cron 트리거 사용법 (운영 모드)

`CRON_AUTO_ENABLED=false` 인 상태에서는 **수동 트리거**로만 자동화 핸들러를 발화합니다.

### 기본 사용

```bash
# A1 — 월요일 채널 안내 즉시 발화 (현재 시각 기준)
curl -X POST \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://ax-champion-bot.labs.wntd.co/api/admin/cron/A1

# A3 — 미제출자 채널 멘션
curl -X POST \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://ax-champion-bot.labs.wntd.co/api/admin/cron/A3

# A4 — 마감 + 트래킹
curl -X POST \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  https://ax-champion-bot.labs.wntd.co/api/admin/cron/A4
```

### 가상 일자 주입 (검증/리허설용)

스케줄 분기(W1 kickoff / 짝수 W slack / 홀수 W offline)를 검증할 때, `?asOf=ISO8601` 로 가상 일자를 주입할 수 있습니다.

```bash
# 5/13(수) W1 가정 → A1 발화 시 kickoff 분기 (자동 발송 비활성)
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "https://ax-champion-bot.labs.wntd.co/api/admin/cron/A1?asOf=2026-05-11T09:00:00%2B09:00"

# 5/20(수) W2 가정 → A3 발화 시 slack 주차 분기 (멘션 안내 발송)
curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "https://ax-champion-bot.labs.wntd.co/api/admin/cron/A3?asOf=2026-05-20T15:00:00%2B09:00"
```

`+09:00` 가 URL 에서는 `%2B09:00` 으로 인코딩됩니다 (`+` 는 공백으로 해석되므로).

### 응답 예시

```json
{
  "ok": true,
  "job": "A1",
  "durationMs": 432,
  "asOf": "2026-05-11T00:00:00.000Z"
}
```

### 5/11 이후 자동 가동 전환

검증이 끝나고 자동 가동을 원하는 시점에:

1. backyard `환경 변수` 탭 → `CRON_AUTO_ENABLED` = `true`
2. `DRY_RUN` = `false` (실제 발송 시작)
3. 컨테이너 재시작
4. 로그에서 `[cron] registration complete: A1, A3, A4` 확인

> 🟢 **완료 산출물:** backyard 환경 변수 12개 모두 주입 완료

---

## 9. 다음 액션 (코드 작업과 합류)

위 1~8 모두 완료되면, 다음을 알려주세요:

- ✅ Slack Bot Token 발급 완료
- ✅ backyard 프로젝트 + Postgres 생성 완료
- ✅ Google Sheet + Service Account 발급 완료

→ 그러면 코드 작업 측에서:
1. 로컬 `npm run dev` 로 1차 테스트
2. `npm run db:migrate` 로 Postgres 스키마 생성
3. `/backyard-deploy` 로 배포
4. dry-run 모드 1차 점검 (운영진 본인 채널/DM 으로만 발송 확인)
5. 5/11 본격 가동 직전 `DRY_RUN=false` 로 전환

---

## 트러블슈팅

| 증상 | 원인 / 대응 |
| --- | --- |
| Slack 앱 설치 시 "관리자 승인 필요" | 워크스페이스 관리자에게 `AX Champion Program 운영 자동화용 봇` 으로 승인 요청 |
| backyard Pod 가 안 뜸 | 환경변수 누락 또는 Postgres 미연결. 로그 탭 확인 |
| Sheets API 403 권한 오류 | §7-4 의 Service Account 이메일을 Sheet 에 **편집자**로 공유했는지 재확인 |
| 봇이 채널에 메시지 못 올림 | `chat:write` scope 빠졌거나 `/invite @봇` 안 됨 |
