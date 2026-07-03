/**
 * 특정 주차 Confluence 리포트만 재생성하는 endpoint.
 *
 * A4 본체(Slack DM·Sheets append·Postgres 기록)는 건드리지 않고, Slack에서 해당 scrumDate의
 * 실제 스크럼 데이터만 다시 읽어 ennoia 분석 + Confluence 페이지만 다시 만든다.
 * `pageId` 를 주면 새 페이지를 만들지 않고 해당 페이지를 덮어쓴다 (잘못된 리포트 정정용).
 *
 * 인증: Authorization: Bearer <ADMIN_API_TOKEN>
 *
 * 사용 예:
 *   curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
 *     "https://ax-champion-bot.labs.wntd.co/api/admin/regenerate-report?week=8&scrumDate=2026-07-01&pageId=4872568843"
 */

import { env } from "@/lib/env";
import {
  fetchChannelMessagesSince,
  fetchThreadReplies,
  findScrumAnnounceTs,
  listChannelMembers,
} from "@/lib/slack";
import { isScrumSubmission } from "@/lib/messages";
import { listParticipants } from "@/lib/sheets";
import {
  buildSubmissionsForReport,
  generateAndPublishWeeklyReport,
} from "@/lib/weekly-report";

export const dynamic = "force-dynamic";

/** KST 기준 YYYY-MM-DD 00:00 → Slack ts(초) */
function dayMidnightKstAsUnixTs(ymd: string): string {
  const local = new Date(`${ymd}T00:00:00+09:00`);
  return (local.getTime() / 1000).toFixed(6);
}

export async function POST(req: Request): Promise<Response> {
  let token: string | undefined;
  try {
    token = env().ADMIN_API_TOKEN;
  } catch {
    return Response.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!provided || provided !== token) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const weekNumber = parseInt(url.searchParams.get("week") ?? "", 10);
  const scrumDate = url.searchParams.get("scrumDate") ?? "";
  const pageId = url.searchParams.get("pageId") ?? undefined;
  if (Number.isNaN(weekNumber) || !/^\d{4}-\d{2}-\d{2}$/.test(scrumDate)) {
    return Response.json(
      { ok: false, error: "invalid_params", expected: "week=N&scrumDate=YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const e = env();
  const start = Date.now();
  try {
    const participants = await listParticipants();
    const active = participants.filter((p) => p.status === "active" && p.slackUserId);
    const activeIds = new Set(active.map((p) => p.slackUserId));

    const channelMembers = new Set(await listChannelMembers(e.SLACK_AX_CHANNEL_ID));
    const expected = active.filter((p) => channelMembers.has(p.slackUserId));

    const threadTs = await findScrumAnnounceTs({
      channelId: e.SLACK_AX_CHANNEL_ID,
      scrumDateYmd: scrumDate,
      adminUserId: e.SLACK_ADMIN_USER_ID,
      lookbackHours: 168,
    });
    const since = dayMidnightKstAsUnixTs(scrumDate);
    const topMessages = await fetchChannelMessagesSince(e.SLACK_AX_CHANNEL_ID, since);
    const threadMessages = threadTs
      ? await fetchThreadReplies(e.SLACK_AX_CHANNEL_ID, threadTs)
      : [];
    const seenTs = new Set<string>();
    const messages = [...topMessages, ...threadMessages].filter((m) => {
      if (seenTs.has(m.ts)) return false;
      seenTs.add(m.ts);
      return true;
    });

    type ScrumMsg = { ts: string; text: string };
    const submitterMsg = new Map<string, ScrumMsg>();
    for (const m of messages) {
      if (!m.user || !activeIds.has(m.user)) continue;
      if (m.ts === threadTs) continue;
      if (!isScrumSubmission(m.text)) continue;
      const cur = submitterMsg.get(m.user);
      if (!cur || parseFloat(m.ts) < parseFloat(cur.ts)) {
        submitterMsg.set(m.user, { ts: m.ts, text: m.text ?? "" });
      }
    }

    const submissions = buildSubmissionsForReport(expected, submitterMsg);
    const report = await generateAndPublishWeeklyReport({
      weekNumber,
      scrumDate,
      participants: submissions,
      existingPageId: pageId,
    });

    return Response.json({
      ok: !!report,
      url: report?.url ?? null,
      pageId: report?.pageId ?? null,
      submitted: submitterMsg.size,
      total: expected.length,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, error: msg, durationMs: Date.now() - start },
      { status: 500 },
    );
  }
}
