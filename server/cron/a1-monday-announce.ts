/**
 * A1 — announce_date 09:00 KST 채널 안내 자동 발송.
 *
 * 동작:
 *  1) weekly_schedule 시트 로드
 *  2) announce_date == 오늘(KST) 인 행 찾기. 없으면 종료.
 *  3) format별 메시지 작성 (kickoff → skip / offline / slack)
 *     - 메시지 본문의 수요일 날짜는 시트의 scrum_date 사용
 *  4) 채널에 게시 (DRY_RUN 시 운영진 DM 으로 우회)
 *  5) cron_runs 락 + audit_log 기록
 */

import { parseISO } from "date-fns";
import { env } from "../../lib/env";
import { recordAuditLog, tryAcquireCronLock } from "../../lib/db";
import { postMessage } from "../../lib/slack";
import {
  msgOfflineAnnouncement,
  msgScrumAnnouncement,
} from "../../lib/messages";
import { findAnnounceForToday, runSlot } from "../../lib/schedule";
import { listWeeklySchedule } from "../../lib/sheets";

const JOB = "A1";

export async function runA1(now: Date = new Date()): Promise<void> {
  const e = env();
  const schedule = await listWeeklySchedule();
  if (schedule.length === 0) {
    console.log("[A1] weekly_schedule sheet is empty; skipping");
    return;
  }

  const today = findAnnounceForToday(now, schedule);
  if (!today) {
    console.log("[A1] today is not an announce_date; skipping");
    return;
  }

  const slot = runSlot(JOB, today.weekNumber);
  const acquired = await tryAcquireCronLock(JOB, slot);
  if (!acquired) {
    console.log(`[A1] already fired for ${slot}; skipping`);
    return;
  }

  if (today.format === "kickoff") {
    console.log(`[A1] W${today.weekNumber} kickoff week; auto announcement disabled`);
    await recordAuditLog({
      jobName: JOB,
      status: "success",
      payload: { skipped: "kickoff_week", weekNumber: today.weekNumber },
    });
    return;
  }

  // scrum_date 가 비어 있으면 안내 보내지 않음 (수요일 일정이 없는 주차)
  if (!today.scrumDate) {
    console.log(`[A1] W${today.weekNumber} has no scrum_date; skipping`);
    await recordAuditLog({
      jobName: JOB,
      status: "success",
      payload: { skipped: "no_scrum_date", weekNumber: today.weekNumber },
    });
    return;
  }

  const scrumDate = parseISO(today.scrumDate);
  let text: string;
  if (today.format === "offline") {
    text = msgOfflineAnnouncement({ wedDate: scrumDate });
  } else {
    text = msgScrumAnnouncement({ wedDate: scrumDate });
  }

  try {
    const r = await postMessage({ channel: e.SLACK_AX_CHANNEL_ID, text });
    await recordAuditLog({
      jobName: JOB,
      channelId: r.channel,
      messageTs: r.ts,
      status: r.dryRun ? "dry_run" : "success",
      payload: {
        weekNumber: today.weekNumber,
        format: today.format,
        scrumDate: today.scrumDate,
      },
    });
    console.log(
      `[A1] posted (dry_run=${r.dryRun}) week=${today.weekNumber} format=${today.format} scrumDate=${today.scrumDate}`,
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

export { JOB as A1_JOB_NAME };
