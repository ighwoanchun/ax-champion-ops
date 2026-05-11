-- 0001_init.sql — AX 챔피언 운영봇 초기 스키마
-- Postgres 15+

-- 슬랙 스크럼 제출 기록
CREATE TABLE IF NOT EXISTS scrum_submissions (
  id              BIGSERIAL PRIMARY KEY,
  week_number     INT NOT NULL,
  scrum_date      DATE NOT NULL,
  slack_user_id   TEXT NOT NULL,
  submitted       BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at    TIMESTAMPTZ,
  message_ts      TEXT,
  has_blocker     BOOLEAN,
  raw_text        TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (week_number, slack_user_id)
);

CREATE INDEX IF NOT EXISTS idx_scrum_user_week
  ON scrum_submissions(slack_user_id, week_number);

-- 이탈 징후
CREATE TABLE IF NOT EXISTS dropout_signals (
  id                BIGSERIAL PRIMARY KEY,
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  slack_user_id     TEXT NOT NULL,
  signal_type       TEXT NOT NULL,
  context           JSONB,
  notified_to_admin BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at       TIMESTAMPTZ,
  resolution        TEXT
);

CREATE INDEX IF NOT EXISTS idx_dropout_unresolved
  ON dropout_signals(slack_user_id) WHERE resolved_at IS NULL;

-- 봇 발송 감사 로그
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  fired_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_name      TEXT NOT NULL,
  channel_id    TEXT,
  message_ts    TEXT,
  payload       JSONB,
  status        TEXT NOT NULL,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_fired_at ON audit_log(fired_at DESC);

-- Cron 중복 실행 방지
CREATE TABLE IF NOT EXISTS cron_runs (
  job_name  TEXT NOT NULL,
  run_slot  TEXT NOT NULL,
  fired_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (job_name, run_slot)
);
