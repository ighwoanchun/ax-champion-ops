/**
 * 주간 리포트 채널 공유 endpoint — 운영진 검토 후 수동 트리거.
 *
 * 인증: Bearer ADMIN_API_TOKEN.
 * Query:
 *   - week: number (선택). 미지정 시 가장 최근 A4 success audit_log 사용
 *   - confluenceUrl: string (선택). 직접 URL override
 *
 * 동작:
 *   1. audit_log 에서 가장 최근 (또는 지정 week) A4 success 행의 payload.confluenceUrl 가져오기
 *   2. lib/messages:msgShareWeeklyReport 로 메시지 작성
 *   3. SLACK_AX_CHANNEL_ID 에 게시 (DRY_RUN 시 운영진 DM 우회)
 */

import { env } from "@/lib/env";
import { getPool } from "@/lib/db";
import { findScrumAnnounceTs, postMessage } from "@/lib/slack";
import { msgShareWeeklyReport } from "@/lib/messages";

export const dynamic = "force-dynamic";

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

  const e = env();
  const url = new URL(req.url);
  const weekRaw = url.searchParams.get("week");
  const overrideUrl = url.searchParams.get("confluenceUrl");

  // 1. confluenceUrl + weekNumber + scrumDate 확보
  let confluenceUrl: string | undefined = overrideUrl ?? undefined;
  let weekNumber: number | undefined;
  let scrumDateYmd: string | undefined;

  // audit_log 에서 최신 A4 success 조회 (지정 week 있으면 필터)
  const sql = weekRaw
    ? `SELECT payload FROM audit_log WHERE job_name = 'A4' AND status = 'success'
       AND payload->>'weekNumber' = $1 AND payload->>'confluenceUrl' IS NOT NULL
       ORDER BY id DESC LIMIT 1`
    : `SELECT payload FROM audit_log WHERE job_name = 'A4' AND status = 'success'
       AND payload->>'confluenceUrl' IS NOT NULL
       ORDER BY id DESC LIMIT 1`;
  const args = weekRaw ? [weekRaw] : [];

  try {
    const result = await getPool().query<{ payload: Record<string, unknown> }>(sql, args);
    const row = result.rows[0];
    if (row) {
      const p = row.payload;
      if (!confluenceUrl && typeof p.confluenceUrl === "string") {
        confluenceUrl = p.confluenceUrl;
      }
      if (typeof p.weekNumber === "number") weekNumber = p.weekNumber;
      if (typeof p.scrumDate === "string") scrumDateYmd = p.scrumDate;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: `audit_log query: ${msg}` }, { status: 500 });
  }

  if (!confluenceUrl) {
    return Response.json(
      { ok: false, error: "no_confluence_url — audit_log 에 A4 success + payload.confluenceUrl 없음. ?confluenceUrl=... 로 직접 전달 가능" },
      { status: 404 },
    );
  }
  if (!weekNumber || !scrumDateYmd) {
    return Response.json(
      { ok: false, error: "incomplete_audit_payload — weekNumber/scrumDate 누락" },
      { status: 500 },
    );
  }

  // 2~3. 메시지 발송
  const scrumDate = new Date(scrumDateYmd + "T18:00:00+09:00"); // 표기용
  const text = msgShareWeeklyReport({
    weekNumber,
    scrumDate,
    confluenceUrl,
  });

  // 양식 공지 thread (운영진 수동 공지 또는 봇 A2)를 자동 탐지해서 그 안에 reply
  const threadTs = await findScrumAnnounceTs({
    channelId: e.SLACK_AX_CHANNEL_ID,
    scrumDateYmd: scrumDateYmd!,
    adminUserId: e.SLACK_ADMIN_USER_ID,
    lookbackHours: 168, // 일주일치 — 운영진 공지가 며칠 일찍 올라가도 인식
  });

  try {
    const r = await postMessage({
      channel: e.SLACK_AX_CHANNEL_ID,
      text,
      threadTs,
    });
    return Response.json({
      ok: true,
      weekNumber,
      scrumDate: scrumDateYmd,
      confluenceUrl,
      slackTs: r.ts,
      threadTs: threadTs ?? null,
      dryRun: r.dryRun,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: `postMessage: ${msg}` }, { status: 500 });
  }
}
