/**
 * Dummy 주간 리포트 생성 endpoint — 검증·페이지 품질 확인용.
 *
 * 인증: Bearer ADMIN_API_TOKEN.
 * Query: ?week=N (기본 2) & scrumDate=YYYY-MM-DD (기본 2026-05-20)
 *
 * W2(2026-05-20) 실제 데이터 기반 21명 더미 제출자로 ennoia 호출 + Confluence 페이지 생성.
 * 결과 페이지 제목: "{N}주차 실행 현황 (W{N}: scrumDate) [DUMMY]"
 */

import { env } from "@/lib/env";
import {
  buildW2DummySubmissions,
  generateAndPublishWeeklyReport,
} from "@/lib/weekly-report";

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

  const url = new URL(req.url);
  const weekRaw = url.searchParams.get("week") ?? "2";
  const weekNumber = parseInt(weekRaw, 10);
  if (Number.isNaN(weekNumber)) {
    return Response.json({ ok: false, error: "invalid_week" }, { status: 400 });
  }
  const scrumDate = url.searchParams.get("scrumDate") ?? "2026-05-20";

  const start = Date.now();
  try {
    const submissions = buildW2DummySubmissions();
    const result = await generateAndPublishWeeklyReport({
      weekNumber,
      scrumDate,
      participants: submissions,
    });
    return Response.json({
      ok: !!result,
      url: result?.url ?? null,
      pageId: result?.pageId ?? null,
      durationMs: Date.now() - start,
      participantCount: submissions.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, error: msg, durationMs: Date.now() - start },
      { status: 500 },
    );
  }
}
