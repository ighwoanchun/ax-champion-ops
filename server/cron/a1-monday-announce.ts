/**
 * A1 — 월요일 09:00 채널 안내 자동 발송.
 *
 * 동작:
 *  1) 프로그램 외 주차이면 종료
 *  2) 이번 주 수요일 형식 판별 (kickoff/offline/slack)
 *  3) 형식별 메시지 작성 후 채널에 게시 (DRY_RUN 시 운영진 DM 으로 우회)
 *  4) cron_runs 락 + audit_log 기록
 */

import { addDays, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { env } from "../../lib/env";
import { recordAuditLog, tryAcquireCronLock } from "../../lib/db";
import { postMessage } from "../../lib/slack";
import {
  msgOfflineAnnouncement,
  msgScrumAnnouncement,
} from "../../lib/messages";
import { getWeekContext, runSlot } from "../../lib/schedule";

const KST = "Asia/Seoul";
const JOB = "A1";

/** 이번 주 수요일 (KST) Date 객체 — 월요일 발화 기준 +2일 */
function thisWedKst(now: Date): Date {
  const monKst = toZonedTime(now, KST);
  return addDays(monKst, 2);
}

export async function runA1(now: Date = new Date()): Promise<void> {
  const e = env();
  const ctx = getWeekContext(now, {
    startDate: e.PROGRAM_START_DATE,
    totalWeeks: e.PROGRAM_WEEKS,
  });

  if (!ctx.isWithinProgram) {
    console.log(`[A1] outside program (week=${ctx.weekNumber}); skipping`);
    return;
  }

  const slot = runSlot(JOB, ctx.weekNumber);
  const acquired = await tryAcquireCronLock(JOB, slot);
  if (!acquired) {
    console.log(`[A1] already fired for ${slot}; skipping`);
    return;
  }

  const wed = thisWedKst(now);
  let text: string;
  if (ctx.wedFormat === "kickoff") {
    // W1 은 별도 킥오프 안내가 운영진 수동 발송 — 자동 발송 비활성
    console.log("[A1] W1 kickoff week; auto announcement disabled");
    await recordAuditLog({
      jobName: JOB,
      status: "success",
      payload: { skipped: "kickoff_week", weekNumber: ctx.weekNumber },
    });
    return;
  } else if (ctx.wedFormat === "offline") {
    text = msgOfflineAnnouncement({ wedDate: wed });
  } else {
    text = msgScrumAnnouncement({ wedDate: wed });
  }

  try {
    const r = await postMessage({ channel: e.SLACK_CHANNEL_ID, text });
    await recordAuditLog({
      jobName: JOB,
      channelId: r.channel,
      messageTs: r.ts,
      status: r.dryRun ? "dry_run" : "success",
      payload: { weekNumber: ctx.weekNumber, wedFormat: ctx.wedFormat },
    });
    console.log(
      `[A1] posted (dry_run=${r.dryRun}) week=${ctx.weekNumber} format=${ctx.wedFormat}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordAuditLog({
      jobName: JOB,
      status: "error",
      errorMessage: msg,
      payload: { weekNumber: ctx.weekNumber },
    });
    throw err;
  }
}

export { JOB as A1_JOB_NAME };
// for type checker
void parseISO;
