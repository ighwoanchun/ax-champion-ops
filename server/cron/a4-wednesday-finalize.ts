/**
 * A4 — 수요일 18:00 슬랙 스크럼 마감 + 트래킹.
 *
 * 동작:
 *  1) 슬랙 주차가 아니면 종료
 *  2) 당일 채널 메시지 스캔 → 제출자/미제출자 분류
 *  3) Postgres `scrum_submissions` 에 전원 한 줄씩 기록
 *  4) Sheets `weekly_report` 탭에 한 줄 append
 *  5) 운영진 DM 으로 마감 요약 발송
 */

import { format, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { env } from "../../lib/env";
import {
  recordAuditLog,
  recordScrumSubmission,
  tryAcquireCronLock,
} from "../../lib/db";
import {
  fetchChannelMessagesSince,
  listChannelMembers,
  notifyAdmin,
} from "../../lib/slack";
import {
  hasBlockerSection,
  isScrumSubmission,
  msgFinalizeAdminReport,
} from "../../lib/messages";
import { appendWeeklyReport, listParticipants } from "../../lib/sheets";
import { getWeekContext, runSlot } from "../../lib/schedule";

const KST = "Asia/Seoul";
const JOB = "A4";

function todayMidnightKstAsUnixTs(now: Date): string {
  const z = toZonedTime(now, KST);
  const startKst = startOfDay(z);
  const utcMs = startKst.getTime() - 9 * 60 * 60 * 1000;
  return (utcMs / 1000).toFixed(6);
}

export async function runA4(now: Date = new Date()): Promise<void> {
  const e = env();
  const ctx = getWeekContext(now, {
    startDate: e.PROGRAM_START_DATE,
    totalWeeks: e.PROGRAM_WEEKS,
  });

  if (!ctx.isWithinProgram || ctx.wedFormat !== "slack") {
    console.log(
      `[A4] not a slack-scrum week (week=${ctx.weekNumber}, format=${ctx.wedFormat}); skipping`,
    );
    return;
  }

  const slot = runSlot(JOB, ctx.weekNumber);
  const acquired = await tryAcquireCronLock(JOB, slot);
  if (!acquired) {
    console.log(`[A4] already fired for ${slot}; skipping`);
    return;
  }

  const participants = await listParticipants();
  const active = participants.filter(
    (p) => p.status === "active" && p.slackUserId,
  );
  const activeIds = new Set(active.map((p) => p.slackUserId));
  const idToName = new Map(active.map((p) => [p.slackUserId, p.name]));

  const channelMembers = new Set(
    await listChannelMembers(e.SLACK_CHANNEL_ID),
  );
  const expected = active.filter((p) => channelMembers.has(p.slackUserId));

  const since = todayMidnightKstAsUnixTs(now);
  const messages = await fetchChannelMessagesSince(
    e.SLACK_CHANNEL_ID,
    since,
  );

  // 사용자별 첫 스크럼 메시지만 채택
  type ScrumMsg = { ts: string; text: string };
  const submitterMsg = new Map<string, ScrumMsg>();
  for (const m of messages) {
    if (!m.user || !activeIds.has(m.user)) continue;
    if (!isScrumSubmission(m.text)) continue;
    const cur = submitterMsg.get(m.user);
    if (!cur || parseFloat(m.ts) < parseFloat(cur.ts)) {
      submitterMsg.set(m.user, { ts: m.ts, text: m.text ?? "" });
    }
  }

  const scrumDate = format(toZonedTime(now, KST), "yyyy-MM-dd");

  // Postgres 기록 (전원)
  for (const p of expected) {
    const sub = submitterMsg.get(p.slackUserId);
    await recordScrumSubmission({
      weekNumber: ctx.weekNumber,
      scrumDate,
      slackUserId: p.slackUserId,
      submitted: !!sub,
      submittedAt: sub ? new Date(parseFloat(sub.ts) * 1000) : undefined,
      messageTs: sub?.ts,
      hasBlocker: sub ? hasBlockerSection(sub.text) : undefined,
      rawText: sub?.text,
    });
  }

  const submittedCount = submitterMsg.size;
  const totalCount = expected.length;
  const missedCount = totalCount - submittedCount;
  const unsubmittedNames = expected
    .filter((p) => !submitterMsg.has(p.slackUserId))
    .map((p) => idToName.get(p.slackUserId) || p.slackUserId);

  // Sheets weekly_report 추가
  await appendWeeklyReport({
    weekNumber: ctx.weekNumber,
    reportDate: scrumDate,
    totalActive: active.length,
    scrumSubmitted: submittedCount,
    scrumMissed: missedCount,
    offlineAttended: 0,
    dropoutSignalCount: 0,
  });

  // 운영진 DM
  await notifyAdmin(
    msgFinalizeAdminReport({
      weekNumber: ctx.weekNumber,
      scrumDate: now,
      submittedCount,
      totalCount,
      unsubmittedNames,
    }),
  );

  await recordAuditLog({
    jobName: JOB,
    status: "success",
    payload: {
      weekNumber: ctx.weekNumber,
      total: totalCount,
      submitted: submittedCount,
      missed: missedCount,
      scrumDate,
    },
  });

  console.log(
    `[A4] finalized week=${ctx.weekNumber} submitted=${submittedCount}/${totalCount}`,
  );
}

export { JOB as A4_JOB_NAME };
