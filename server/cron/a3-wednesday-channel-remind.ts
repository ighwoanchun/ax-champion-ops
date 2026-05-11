/**
 * A3 — 수요일 15:00 슬랙 스크럼 미제출자 채널 멘션 안내.
 *
 * 동작:
 *  1) 슬랙 주차가 아니면 종료 (kickoff/offline 주차에는 비활성)
 *  2) 채널 멤버 = active participants 의 slack_user_id 와 매칭
 *  3) 당일 00:00 이후 채널 메시지 중 본인 발화 + '📌 위클리 스크럼' 시작 = 제출자
 *  4) 미제출자 = active 멤버 - 제출자
 *  5) 0명이면 "전원 제출 완료" 게시, 1명+ 이면 멘션 안내 게시
 */

import { format, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { env } from "../../lib/env";
import {
  recordAuditLog,
  tryAcquireCronLock,
} from "../../lib/db";
import {
  fetchChannelMessagesSince,
  listChannelMembers,
  notifyAdmin,
  postMessage,
} from "../../lib/slack";
import {
  isScrumSubmission,
  msgAllSubmitted,
  msgUnsubmittedReminder,
} from "../../lib/messages";
import { listParticipants } from "../../lib/sheets";
import { getWeekContext, runSlot } from "../../lib/schedule";

const KST = "Asia/Seoul";
const JOB = "A3";

function todayMidnightKstAsUnixTs(now: Date): string {
  const z = toZonedTime(now, KST);
  const startKst = startOfDay(z);
  // KST 자정 → UTC ms → Slack ts (초 단위)
  const utcMs = startKst.getTime() - 9 * 60 * 60 * 1000;
  return (utcMs / 1000).toFixed(6);
}

export async function runA3(now: Date = new Date()): Promise<void> {
  const e = env();
  const ctx = getWeekContext(now, {
    startDate: e.PROGRAM_START_DATE,
    totalWeeks: e.PROGRAM_WEEKS,
  });

  if (!ctx.isWithinProgram || ctx.wedFormat !== "slack") {
    console.log(
      `[A3] not a slack-scrum week (week=${ctx.weekNumber}, format=${ctx.wedFormat}); skipping`,
    );
    return;
  }

  const slot = runSlot(JOB, ctx.weekNumber);
  const acquired = await tryAcquireCronLock(JOB, slot);
  if (!acquired) {
    console.log(`[A3] already fired for ${slot}; skipping`);
    return;
  }

  // 1. participants → active 멤버 set
  const participants = await listParticipants();
  const activeIds = new Set(
    participants
      .filter((p) => p.status === "active" && p.slackUserId)
      .map((p) => p.slackUserId),
  );

  if (activeIds.size === 0) {
    await notifyAdmin(
      "[A3] participants 시트에 active 인원이 없어 발송을 건너뜁니다. Sheets 를 확인해주세요.",
    );
    await recordAuditLog({
      jobName: JOB,
      status: "error",
      errorMessage: "no_active_participants",
      payload: { weekNumber: ctx.weekNumber },
    });
    return;
  }

  // 2. 채널 멤버 ∩ active
  const channelMembers = new Set(await listChannelMembers(e.SLACK_CHANNEL_ID));
  const expected: string[] = [];
  for (const id of activeIds) {
    if (channelMembers.has(id)) expected.push(id);
  }

  // 3. 당일 메시지 → 제출자 식별
  const since = todayMidnightKstAsUnixTs(now);
  const messages = await fetchChannelMessagesSince(e.SLACK_CHANNEL_ID, since);
  const submitters = new Set<string>();
  for (const m of messages) {
    if (!m.user) continue;
    if (isScrumSubmission(m.text)) submitters.add(m.user);
  }

  // 4. 미제출자
  const unsubmitted = expected.filter((id) => !submitters.has(id));

  // 5. 메시지 발송
  const text =
    unsubmitted.length === 0
      ? msgAllSubmitted()
      : msgUnsubmittedReminder({ unsubmittedUserIds: unsubmitted });

  try {
    const r = await postMessage({ channel: e.SLACK_CHANNEL_ID, text });
    await recordAuditLog({
      jobName: JOB,
      channelId: r.channel,
      messageTs: r.ts,
      status: r.dryRun ? "dry_run" : "success",
      payload: {
        weekNumber: ctx.weekNumber,
        expected: expected.length,
        submitted: submitters.size,
        unsubmitted: unsubmitted.length,
        unsubmittedIds: unsubmitted,
        scrumDate: format(toZonedTime(now, KST), "yyyy-MM-dd"),
      },
    });
    console.log(
      `[A3] posted (dry_run=${r.dryRun}) week=${ctx.weekNumber} unsubmitted=${unsubmitted.length}`,
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

export { JOB as A3_JOB_NAME };
