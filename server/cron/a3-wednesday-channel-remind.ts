/**
 * A3 — scrum_date 15:00 슬랙 스크럼 중간 현황 (긍정 톤).
 *
 * 동작:
 *  1) weekly_schedule 시트에서 오늘이 scrum_date + format=slack 인지 확인
 *  2) 채널 멤버 = active participants 의 slack_user_id 와 매칭
 *  3) 당일 00:00 이후 채널 메시지 중 본인 발화 + '위클리스크럼' 포함 = 제출자
 *  4) 미제출자 = active 멤버 - 제출자
 *  5) 전원 제출이면 축하 메시지, 그 외엔 "✅ N명 제출 완료 / 작성 중이신 분 ..." 게시
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
  findScrumAnnounceTs,
  listChannelMembers,
  notifyAdmin,
  postMessage,
} from "../../lib/slack";
import {
  isScrumSubmission,
  msgAllSubmitted,
  msgScrumMidStatus,
} from "../../lib/messages";
import { listParticipants, listWeeklySchedule } from "../../lib/sheets";
import { findScrumForToday, runSlot } from "../../lib/schedule";

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
  const schedule = await listWeeklySchedule();
  if (schedule.length === 0) {
    console.log("[A3] weekly_schedule sheet is empty; skipping");
    return;
  }

  const today = findScrumForToday(now, schedule);
  if (!today || today.format !== "slack") {
    console.log(
      `[A3] today is not a slack scrum_date (matched=${today?.weekNumber ?? "none"}, format=${today?.format ?? "n/a"}); skipping`,
    );
    return;
  }

  const slot = runSlot(JOB, today.weekNumber);
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
      payload: { weekNumber: today.weekNumber },
    });
    return;
  }

  // 2. 채널 멤버 ∩ active
  const channelMembers = new Set(await listChannelMembers(e.SLACK_AX_CHANNEL_ID));
  const expected: string[] = [];
  for (const id of activeIds) {
    if (channelMembers.has(id)) expected.push(id);
  }

  // 3. 당일 메시지 → 제출자 식별
  const since = todayMidnightKstAsUnixTs(now);
  const messages = await fetchChannelMessagesSince(e.SLACK_AX_CHANNEL_ID, since);
  const submitters = new Set<string>();
  for (const m of messages) {
    if (!m.user) continue;
    if (isScrumSubmission(m.text)) submitters.add(m.user);
  }

  // 4. 미제출자
  const unsubmitted = expected.filter((id) => !submitters.has(id));

  // 5. 메시지 발송 (긍정 톤: 제출자 N명 + 작성 중 분 멘션)
  const text =
    unsubmitted.length === 0
      ? msgAllSubmitted()
      : msgScrumMidStatus({
          submittedCount: submitters.size,
          unsubmittedUserIds: unsubmitted,
        });

  // 운영진 또는 봇 A2가 올린 양식 공지 메시지를 찾아 thread reply 로 게시
  const threadTs = await findScrumAnnounceTs({
    channelId: e.SLACK_AX_CHANNEL_ID,
    scrumDateYmd: today.scrumDate,
    adminUserId: e.SLACK_ADMIN_USER_ID,
  });

  try {
    const r = await postMessage({
      channel: e.SLACK_AX_CHANNEL_ID,
      text,
      threadTs,
    });
    await recordAuditLog({
      jobName: JOB,
      channelId: r.channel,
      messageTs: r.ts,
      status: r.dryRun ? "dry_run" : "success",
      payload: {
        weekNumber: today.weekNumber,
        expected: expected.length,
        submitted: submitters.size,
        unsubmitted: unsubmitted.length,
        unsubmittedIds: unsubmitted,
        scrumDate: format(toZonedTime(now, KST), "yyyy-MM-dd"),
      },
    });
    console.log(
      `[A3] posted (dry_run=${r.dryRun}) week=${today.weekNumber} unsubmitted=${unsubmitted.length}`,
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

export { JOB as A3_JOB_NAME };
