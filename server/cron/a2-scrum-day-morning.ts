/**
 * A2 — 스크럼 당일 11시 양식 안내.
 *
 * 동작:
 *  1) weekly_schedule 시트에서 오늘이 scrum_date + format=slack 인지 확인
 *  2) 본 쓰레드 양식 안내 메시지를 채널에 게시 (DRY_RUN 시 운영진 DM 우회)
 *  3) cron_runs 락 + audit_log
 *
 * 메시지 본문은 lib/messages.ts:msgScrumDayForm() 참고.
 * 참가자는 이 메시지의 스레드에 양식 채워서 댓글로 공유.
 */

import { env } from "../../lib/env";
import { recordAuditLog, tryAcquireCronLock } from "../../lib/db";
import { postMessage } from "../../lib/slack";
import { msgScrumDayForm } from "../../lib/messages";
import { findScrumForToday, runSlot } from "../../lib/schedule";
import { listWeeklySchedule } from "../../lib/sheets";

const JOB = "A2";

export async function runA2(now: Date = new Date()): Promise<void> {
  const e = env();
  const schedule = await listWeeklySchedule();
  if (schedule.length === 0) {
    console.log("[A2] weekly_schedule sheet is empty; skipping");
    return;
  }

  const today = findScrumForToday(now, schedule);
  if (!today || today.format !== "slack") {
    console.log(
      `[A2] today is not a slack scrum_date (matched=${today?.weekNumber ?? "none"}, format=${today?.format ?? "n/a"}); skipping`,
    );
    return;
  }

  const slot = runSlot(JOB, today.weekNumber);
  const acquired = await tryAcquireCronLock(JOB, slot);
  if (!acquired) {
    console.log(`[A2] already fired for ${slot}; skipping`);
    return;
  }

  const text = msgScrumDayForm();

  try {
    const r = await postMessage({ channel: e.SLACK_AX_CHANNEL_ID, text });
    await recordAuditLog({
      jobName: JOB,
      channelId: r.channel,
      messageTs: r.ts,
      status: r.dryRun ? "dry_run" : "success",
      payload: { weekNumber: today.weekNumber, scrumDate: today.scrumDate },
    });
    console.log(
      `[A2] posted (dry_run=${r.dryRun}) week=${today.weekNumber} scrumDate=${today.scrumDate}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordAuditLog({
      jobName: JOB,
      status: "error",
      errorMessage: msg,
      payload: { weekNumber: today.weekNumber },
    });
    throw err;
  }
}

export { JOB as A2_JOB_NAME };
