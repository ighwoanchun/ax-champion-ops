/**
 * Atlassian Confluence REST API v2 클라이언트.
 *
 * 인증: Basic Auth (email + API token, base64 인코딩).
 * API token 발급: https://id.atlassian.com/manage-profile/security/api-tokens
 *
 * 페이지 생성: POST /wiki/api/v2/pages
 * 본문 representation: "storage"(XHTML, default) / "atlas_doc_format"(ADF) / "wiki"(구버전 markup).
 * ennoia 출력이 마크다운이면 wiki representation 으로 그대로 전달하거나, storage로 변환 필요.
 *
 * 본 구현은 ennoia가 마크다운을 반환한다고 가정하고, wiki markup으로 매핑한 뒤
 * Confluence 가 자체적으로 렌더링하도록 한다. 마크다운→Confluence wiki 변환은 한정적이므로
 * 복잡한 표·이미지가 깨지면 storage(XHTML)로 변환 라이브러리 도입 필요.
 */

import { marked } from "marked";
import { env } from "./env";

/**
 * 마크다운 문자열을 Confluence storage representation(XHTML)로 변환.
 * marked 의 기본 HTML 출력을 그대로 사용. Confluence storage 는 표준 XHTML 일부를 허용.
 */
export function markdownToStorage(md: string): string {
  // marked 가 동기 호출도 지원하지만 v18부터 async 가 권장. 단순 변환은 sync 도 OK.
  const html = marked.parse(md, { async: false }) as string;
  return html;
}

const BASE_URL_TEMPLATE = "https://{cloudId}/wiki/api/v2";

function baseUrl(): string {
  const e = env();
  if (!e.ATLASSIAN_CLOUD_ID) {
    throw new Error("[confluence] ATLASSIAN_CLOUD_ID not configured");
  }
  return BASE_URL_TEMPLATE.replace("{cloudId}", e.ATLASSIAN_CLOUD_ID);
}

function authHeader(): string {
  const e = env();
  if (!e.ATLASSIAN_EMAIL || !e.ATLASSIAN_API_TOKEN) {
    throw new Error("[confluence] ATLASSIAN_EMAIL or ATLASSIAN_API_TOKEN not configured");
  }
  const basic = Buffer.from(`${e.ATLASSIAN_EMAIL}:${e.ATLASSIAN_API_TOKEN}`).toString("base64");
  return `Basic ${basic}`;
}

export type ConfluenceRepresentation = "storage" | "atlas_doc_format" | "wiki";

export interface CreatePageInput {
  parentId: string;
  title: string;
  /** representation 에 맞는 본문 문자열(또는 ADF의 경우 JSON.stringify된 문자열) */
  body: string;
  representation?: ConfluenceRepresentation;
  spaceId?: string; // v2 API 는 parentId가 있으면 spaceId 생략 가능
}

export interface CreatePageResult {
  id: string;
  title: string;
  webui: string;
  status: number;
}

/** 페이지 정보 조회 (id, spaceId, title 등) */
export async function getPageInfo(pageId: string): Promise<{
  id: string;
  spaceId: string;
  title: string;
}> {
  const url = `${baseUrl()}/pages/${pageId}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`[confluence] getPageInfo failed ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id: string; spaceId: string; title: string };
  return data;
}

/** 페이지 본문 조회 (storage representation). 이전 주차 리포트 참고용 */
export async function getPageBody(pageId: string): Promise<{
  id: string;
  title: string;
  body: string;
}> {
  const url = `${baseUrl()}/pages/${pageId}?body-format=storage`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`[confluence] getPageBody failed ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    id: string;
    title: string;
    body?: { storage?: { value?: string } };
  };
  return {
    id: data.id,
    title: data.title,
    body: data.body?.storage?.value ?? "",
  };
}

/** Confluence v2 페이지 생성. spaceId 미입력 시 parentId 로부터 자동 조회. */
export async function createConfluencePage(input: CreatePageInput): Promise<CreatePageResult> {
  const url = `${baseUrl()}/pages`;
  const representation: ConfluenceRepresentation = input.representation ?? "storage";

  let spaceId = input.spaceId;
  if (!spaceId) {
    const parent = await getPageInfo(input.parentId);
    spaceId = parent.spaceId;
  }

  const payload: Record<string, unknown> = {
    spaceId,
    parentId: input.parentId,
    status: "current",
    title: input.title,
    body: {
      representation,
      value: input.body,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[confluence] createPage failed ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    id: string;
    title: string;
    _links?: { webui?: string };
  };
  return {
    id: data.id,
    title: data.title,
    webui: data._links?.webui ?? "",
    status: res.status,
  };
}

/** 기존 페이지 본문을 새 storage 본문으로 덮어씀 (버전 자동 증가). 잘못 생성된 리포트 정정용. */
export async function updateConfluencePage(input: {
  pageId: string;
  title: string;
  body: string;
  representation?: ConfluenceRepresentation;
}): Promise<CreatePageResult> {
  const infoRes = await fetch(`${baseUrl()}/pages/${input.pageId}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!infoRes.ok) {
    const t = await infoRes.text();
    throw new Error(`[confluence] updatePage getInfo failed ${infoRes.status}: ${t.slice(0, 300)}`);
  }
  const info = (await infoRes.json()) as { version?: { number?: number } };
  const nextVersion = (info.version?.number ?? 0) + 1;

  const payload = {
    id: input.pageId,
    status: "current",
    title: input.title,
    body: {
      representation: input.representation ?? "storage",
      value: input.body,
    },
    version: { number: nextVersion },
  };

  const res = await fetch(`${baseUrl()}/pages/${input.pageId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[confluence] updatePage failed ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    id: string;
    title: string;
    _links?: { webui?: string };
  };
  return {
    id: data.id,
    title: data.title,
    webui: data._links?.webui ?? "",
    status: res.status,
  };
}

/** 페이지 절대 URL 조립 */
export function absoluteWebUrl(webui: string): string {
  const e = env();
  if (!e.ATLASSIAN_CLOUD_ID || !webui) return webui;
  return `https://${e.ATLASSIAN_CLOUD_ID}/wiki${webui}`;
}
