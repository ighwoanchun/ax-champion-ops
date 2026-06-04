/**
 * 임의 Confluence 페이지 생성 endpoint.
 *
 * 인증: Bearer ADMIN_API_TOKEN.
 * Body (JSON):
 *   - title: string (필수)
 *   - markdown: string (필수, 본문 마크다운)
 *   - parentId: string (선택, 미지정 시 CONFLUENCE_PARENT_PAGE_ID)
 *
 * 결과: { ok, pageId, url }
 *
 * 마크다운을 marked로 HTML 변환 후 Confluence storage representation 으로 게시.
 */

import { env } from "@/lib/env";
import {
  absoluteWebUrl,
  createConfluencePage,
  markdownToStorage,
} from "@/lib/confluence";

export const dynamic = "force-dynamic";

interface PostPageBody {
  title?: unknown;
  markdown?: unknown;
  parentId?: unknown;
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

  let body: PostPageBody;
  try {
    body = (await req.json()) as PostPageBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json_body" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  if (!title || !markdown) {
    return Response.json(
      { ok: false, error: "title and markdown required" },
      { status: 400 },
    );
  }
  const parentId =
    typeof body.parentId === "string" && body.parentId.trim()
      ? body.parentId.trim()
      : env().CONFLUENCE_PARENT_PAGE_ID;
  if (!parentId) {
    return Response.json(
      { ok: false, error: "parentId not provided and CONFLUENCE_PARENT_PAGE_ID empty" },
      { status: 400 },
    );
  }

  const start = Date.now();
  try {
    const storage = markdownToStorage(markdown);
    const page = await createConfluencePage({
      parentId,
      title,
      body: storage,
      representation: "storage",
    });
    return Response.json({
      ok: true,
      pageId: page.id,
      url: absoluteWebUrl(page.webui),
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
