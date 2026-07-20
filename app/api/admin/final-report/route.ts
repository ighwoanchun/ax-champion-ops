/**
 * 종료 설문 기반 마무리 리포트를 생성해 Confluence 에 게시하는 관리자 수동 트리거.
 *
 * 자동 cron 없음 — 응답률이 충분히 쌓였는지는 운영진이 직접 판단해서 호출한다.
 * 대표 사례·프로그램 소개 같은 서사 섹션은 만들지 않는다. 설문 정량 집계 + 정성 테마만 자동 생성하고,
 * 그 위에 운영진이 사례 등을 수동으로 보강하는 것을 전제로 한다.
 *
 * 인증: Authorization: Bearer <ADMIN_API_TOKEN>
 *
 * 사용 예:
 *   curl -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
 *     "https://ax-champion-bot.labs.wntd.co/api/admin/final-report?cohort=4기&total=20"
 *
 * 잘못 생성된 리포트 정정: &pageId=<기존 페이지 ID> 추가 시 새로 만들지 않고 덮어씀.
 */

import { env } from "@/lib/env";
import { generateAndPublishFinalReport } from "@/lib/final-report";

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
  const cohortLabel = url.searchParams.get("cohort") ?? "";
  const total = parseInt(url.searchParams.get("total") ?? "", 10);
  const pageId = url.searchParams.get("pageId") ?? undefined;
  if (!cohortLabel || Number.isNaN(total)) {
    return Response.json(
      { ok: false, error: "invalid_params", expected: "cohort=4기&total=20" },
      { status: 400 },
    );
  }

  const start = Date.now();
  try {
    const report = await generateAndPublishFinalReport({
      cohortLabel,
      totalParticipants: total,
      existingPageId: pageId,
    });
    if (!report) {
      return Response.json(
        { ok: false, error: "not_configured", detail: "SURVEY_SHEET_ID/GEMINI_API_KEY/ATLASSIAN_* 환경변수를 확인하세요." },
        { status: 503 },
      );
    }
    return Response.json({
      ok: true,
      url: report.url,
      pageId: report.pageId,
      surveyResponseCount: report.responseCount,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg, durationMs: Date.now() - start }, { status: 500 });
  }
}
