import { Pool } from "pg";
import { env } from "./env";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: env().DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err) => {
    console.error("[db] pool error:", err);
  });
  return pool;
}

/**
 * Cron 잡 중복 실행 방지용 락.
 * (job_name, run_slot) UNIQUE INSERT 시도 → 이미 있으면 false 반환.
 */
export async function tryAcquireCronLock(
  jobName: string,
  runSlot: string,
): Promise<boolean> {
  const result = await getPool().query(
    `INSERT INTO cron_runs (job_name, run_slot)
     VALUES ($1, $2)
     ON CONFLICT (job_name, run_slot) DO NOTHING
     RETURNING fired_at`,
    [jobName, runSlot],
  );
  return (result.rowCount ?? 0) > 0;
}

export type AuditLogStatus = "success" | "dry_run" | "error";

export async function recordAuditLog(input: {
  jobName: string;
  channelId?: string;
  messageTs?: string;
  payload?: unknown;
  status: AuditLogStatus;
  errorMessage?: string;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO audit_log (job_name, channel_id, message_ts, payload, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.jobName,
      input.channelId ?? null,
      input.messageTs ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
      input.status,
      input.errorMessage ?? null,
    ],
  );
}

export async function recordScrumSubmission(input: {
  weekNumber: number;
  scrumDate: string; // YYYY-MM-DD
  slackUserId: string;
  submitted: boolean;
  submittedAt?: Date;
  messageTs?: string;
  hasBlocker?: boolean;
  rawText?: string;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO scrum_submissions
       (week_number, scrum_date, slack_user_id, submitted, submitted_at, message_ts, has_blocker, raw_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (week_number, slack_user_id)
     DO UPDATE SET
       submitted    = EXCLUDED.submitted,
       submitted_at = EXCLUDED.submitted_at,
       message_ts   = EXCLUDED.message_ts,
       has_blocker  = EXCLUDED.has_blocker,
       raw_text     = EXCLUDED.raw_text,
       recorded_at  = NOW()`,
    [
      input.weekNumber,
      input.scrumDate,
      input.slackUserId,
      input.submitted,
      input.submittedAt ?? null,
      input.messageTs ?? null,
      input.hasBlocker ?? null,
      input.rawText ?? null,
    ],
  );
}

export async function getConsecutiveMissCount(
  slackUserId: string,
  upToWeek: number,
): Promise<number> {
  const result = await getPool().query<{ week_number: number; submitted: boolean }>(
    `SELECT week_number, submitted FROM scrum_submissions
     WHERE slack_user_id = $1 AND week_number <= $2
     ORDER BY week_number DESC`,
    [slackUserId, upToWeek],
  );
  let count = 0;
  for (const row of result.rows) {
    if (!row.submitted) count++;
    else break;
  }
  return count;
}
