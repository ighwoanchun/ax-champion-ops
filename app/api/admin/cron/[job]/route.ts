/**
 * 수동 Cron 트리거 endpoint.
 *
 * 인증: `Authorization: Bearer <ADMIN_API_TOKEN>` 헤더 필수.
 *
 * 사용 예시:
 *   curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
 *        "https://ax-champion-bot.labs.wntd.co/api/admin/cron/A1"
 *
 * 가상 일자 주입 (스케줄 분기 검증용):
 *   curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
 *        "https://ax-champion-bot.labs.wntd.co/api/admin/cron/A3?asOf=2026-05-20T15:00:00+09:00"
 *
 * 반환:
 *   { ok, job, durationMs, asOf }
 */

import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const VALID_JOBS = new Set(["A1", "A2", "A3", "A4"]);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ job: string }> },
) {
  // 인증
  let token: string | undefined;
  try {
    token = env().ADMIN_API_TOKEN;
  } catch {
    return Response.json(
      { ok: false, error: "server_misconfigured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!provided || provided !== token) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { job: rawJob } = await ctx.params;
  const job = rawJob.toUpperCase();
  if (!VALID_JOBS.has(job)) {
    return Response.json(
      { ok: false, error: "unknown_job", validJobs: [...VALID_JOBS] },
      { status: 400 },
    );
  }

  // 가상 일자 (선택). 형식: ISO 8601 e.g. 2026-05-20T15:00:00+09:00
  const url = new URL(req.url);
  const asOfRaw = url.searchParams.get("asOf");
  const asOf = asOfRaw ? new Date(asOfRaw) : new Date();
  if (asOfRaw && Number.isNaN(asOf.getTime())) {
    return Response.json(
      { ok: false, error: "invalid_asOf", expected: "ISO 8601 datetime" },
      { status: 400 },
    );
  }

  const start = Date.now();
  try {
    if (job === "A1") {
      const { runA1 } = await import("@/server/cron/a1-monday-announce");
      await runA1(asOf);
    } else if (job === "A2") {
      const { runA2 } = await import("@/server/cron/a2-scrum-day-morning");
      await runA2(asOf);
    } else if (job === "A3") {
      const { runA3 } = await import("@/server/cron/a3-wednesday-channel-remind");
      await runA3(asOf);
    } else if (job === "A4") {
      const { runA4 } = await import("@/server/cron/a4-wednesday-finalize");
      await runA4(asOf);
    }
    return Response.json({
      ok: true,
      job,
      durationMs: Date.now() - start,
      asOf: asOf.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[admin/cron/${job}] error:`, err);
    return Response.json(
      {
        ok: false,
        job,
        error: message,
        durationMs: Date.now() - start,
        asOf: asOf.toISOString(),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return Response.json(
    {
      ok: false,
      error: "method_not_allowed",
      hint: "Use POST with Authorization: Bearer <ADMIN_API_TOKEN>",
    },
    { status: 405 },
  );
}
