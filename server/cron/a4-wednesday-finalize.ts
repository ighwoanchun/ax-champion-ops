/**
 * A4 — 익일 10:00 슬랙 스크럼 마감 요약 (어제 = scrum_date 인 경우 발화).
 *
 * 동작:
 *  1) weekly_schedule 시트에서 어제가 scrum_date + format=slack 인지 확인
 *  2) 어제 채널 메시지 스캔 → 제출자/미제출자 분류
 *  3) Postgres `scrum_submissions` 에 전원 한 줄씩 기록
 *  4) Sheets `weekly_report` 탭에 한 줄 append
 *  5) 운영진 DM 으로 마감 요약 발송 (ai-줍줍 게시자 명단 포함)
 */

import { format, parseISO, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { env } from "../../lib/env";
import {
  recordAuditLog,
  recordScrumSubmission,
  tryAcquireCronLock,
} from "../../lib/db";
import {
  fetchChannelMessagesSince,
  fetchThreadReplies,
  findScrumAnnounceTs,
  listChannelMembers,
  notifyAdmin,
} from "../../lib/slack";
import {
  hasBlockerSection,
  isJubjubProjectPost,
  isScrumSubmission,
  msgFinalizeAdminReport,
} from "../../lib/messages";
import {
  appendWeeklyReport,
  listParticipants,
  listWeeklySchedule,
} from "../../lib/sheets";
import { findFinalizationDay, runSlot } from "../../lib/schedule";
import {
  buildSubmissionsForReport,
  generateAndPublishWeeklyReport,
} from "../../lib/weekly-report";

const KST = "Asia/Seoul";
const JOB = "A4";

/** KST 기준 특정 일자(YYYY-MM-DD) 00:00 → Slack ts 초 단위 */
function dayMidnightKstAsUnixTs(ymd: string): string {
  // parseISO("2026-06-02") 는 local timezone 의 00:00 으로 해석됨.
  // 컨테이너 TZ=Asia/Seoul 이므로 결과는 KST 00:00 = UTC -9.
  const local = parseISO(ymd);
  const utcMs = local.getTime() - 9 * 60 * 60 * 1000;
  return (utcMs / 1000).toFixed(6);
}

export async function runA4(now: Date = new Date()): Promise<void> {
  const e = env();
  const schedule = await listWeeklySchedule();
  if (schedule.length === 0) {
    console.log("[A4] weekly_schedule sheet is empty; skipping");
    return;
  }

  // 어제(KST)가 scrum_date 인 행을 찾는다. 즉 오늘이 마감 익일 처리일.
  const today = findFinalizationDay(now, schedule);
  if (!today || today.format !== "slack") {
    console.log(
      `[A4] yesterday was not a slack scrum_date (matched=${today?.weekNumber ?? "none"}, format=${today?.format ?? "n/a"}); skipping`,
    );
    return;
  }

  const slot = runSlot(JOB, today.weekNumber);
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
    await listChannelMembers(e.SLACK_AX_CHANNEL_ID),
  );
  const expected = active.filter((p) => channelMembers.has(p.slackUserId));

  // 스크럼 메시지는 scrum_date 당일 채널 top-level + 양식 공지 thread reply 모두 확인.
  // (참가자들이 thread 안에 댓글로 작성하는 패턴 — A3와 동일 처리)
  const threadTs = await findScrumAnnounceTs({
    channelId: e.SLACK_AX_CHANNEL_ID,
    scrumDateYmd: today.scrumDate,
    adminUserId: e.SLACK_ADMIN_USER_ID,
    lookbackHours: 168,
  });
  const since = dayMidnightKstAsUnixTs(today.scrumDate);
  const topMessages = await fetchChannelMessagesSince(
    e.SLACK_AX_CHANNEL_ID,
    since,
  );
  const threadMessages = threadTs
    ? await fetchThreadReplies(e.SLACK_AX_CHANNEL_ID, threadTs)
    : [];
  const seenTs = new Set<string>();
  const messages = [...topMessages, ...threadMessages].filter((m) => {
    if (seenTs.has(m.ts)) return false;
    seenTs.add(m.ts);
    return true;
  });

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

  // scrum_date 는 시트 기준(어제). reportDate 등에도 동일하게 사용.
  const scrumDate = today.scrumDate;
  // for unused import noise 회피
  void format; void toZonedTime; void startOfDay;

  // Postgres 기록 (전원)
  for (const p of expected) {
    const sub = submitterMsg.get(p.slackUserId);
    await recordScrumSubmission({
      weekNumber: today.weekNumber,
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
    weekNumber: today.weekNumber,
    reportDate: scrumDate,
    totalActive: active.length,
    scrumSubmitted: submittedCount,
    scrumMissed: missedCount,
    offlineAttended: 0,
    dropoutSignalCount: 0,
  });

  // ai-줍줍 게시 카운트 트래킹 (지난 7일, 게시자 명단 표시).
  let aiJubjubStats: {
    total: number;
    posters: { name: string; count: number }[];
  } | undefined;
  if (e.SLACK_AI_JUBJUB_CHANNEL_ID && active.length > 0) {
    try {
      const sevenDaysAgoTs = (
        (now.getTime() - 7 * 24 * 60 * 60 * 1000) /
        1000
      ).toFixed(6);
      const jubjubMessages = await fetchChannelMessagesSince(
        e.SLACK_AI_JUBJUB_CHANNEL_ID,
        sevenDaysAgoTs,
      );
      const counts = new Map<string, number>();
      for (const p of active) counts.set(p.slackUserId, 0);
      for (const m of jubjubMessages) {
        if (!m.user) continue;
        if (!isJubjubProjectPost(m.text)) continue;
        if (counts.has(m.user)) {
          counts.set(m.user, (counts.get(m.user) ?? 0) + 1);
        }
      }
      const totalPosts = Array.from(counts.values()).reduce((a, b) => a + b, 0);
      const posters = active
        .filter((p) => (counts.get(p.slackUserId) ?? 0) > 0)
        .map((p) => ({
          name: p.name,
          count: counts.get(p.slackUserId) ?? 0,
        }));
      aiJubjubStats = { total: totalPosts, posters };
    } catch (err) {
      console.error("[A4] ai-jubjub fetch failed (continuing):", err);
    }
  }

  // Confluence 주간 리포트 자동 생성 (ennoia 분석 + Atlassian API).
  // 환경변수 미주입·실패 시 silent skip — A4 본체는 정상 마감.
  let confluenceUrl: string | undefined;
  try {
    const submissions = buildSubmissionsForReport(active, submitterMsg);
    const report = await generateAndPublishWeeklyReport({
      weekNumber: today.weekNumber,
      scrumDate: today.scrumDate,
      participants: submissions,
    });
    confluenceUrl = report?.url;
  } catch (err) {
    console.error("[A4] weekly-report generation failed (continuing):", err);
  }

  // 운영진 DM
  await notifyAdmin(
    msgFinalizeAdminReport({
      weekNumber: today.weekNumber,
      scrumDate: now,
      submittedCount,
      totalCount,
      unsubmittedNames,
      aiJubjubStats,
      confluenceUrl,
    }),
  );

  await recordAuditLog({
    jobName: JOB,
    status: "success",
    payload: {
      weekNumber: today.weekNumber,
      total: totalCount,
      submitted: submittedCount,
      missed: missedCount,
      scrumDate,
      aiJubjub: aiJubjubStats
        ? {
            total: aiJubjubStats.total,
            posterCount: aiJubjubStats.posters.length,
          }
        : null,
      confluenceUrl: confluenceUrl ?? null,
    },
  });

  console.log(
    `[A4] finalized week=${today.weekNumber} submitted=${submittedCount}/${totalCount}`,
  );
}

export { JOB as A4_JOB_NAME };
