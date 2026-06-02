/**
 * ennoia API 클라이언트 (https://api.ennoia.so/api/preset/v2/chat/completions).
 *
 * 인증: 두 헤더 — `project` (프로젝트 ID), `apiKey` (Bearer 아님).
 * agent 식별: body.hash.
 * 메시지 형식: Anthropic Claude 호환 — content 는 배열로 {type:'text', text}.
 *
 * 응답 형식은 사용 모델에 따라 변동 가능 (OpenAI 호환 또는 Anthropic 호환).
 * 본 클라이언트는 가능한 패턴을 fallback 로 모두 처리.
 */

import { env } from "./env";

export interface EnnoiaCallInput {
  /** 분석 대상 데이터를 담은 사용자 메시지 (보통 JSON.stringify 된 문자열) */
  userText: string;
  /** params 필드 (선택). ennoia 에이전트가 정의한 변수에 따라 사용 */
  params?: Record<string, unknown>;
  /** 타임아웃 (밀리초). 기본 90초. */
  timeoutMs?: number;
}

export interface EnnoiaCallResult {
  /** 추출된 어시스턴트 응답 텍스트 (마크다운) */
  text: string;
  /** 원본 응답 JSON. 디버깅·audit_log 용 */
  raw: unknown;
  /** 응답 상태 코드 */
  status: number;
}

export async function runEnnoiaAgent(
  input: EnnoiaCallInput,
): Promise<EnnoiaCallResult> {
  const e = env();
  if (
    !e.ENNOIA_API_TOKEN ||
    !e.ENNOIA_PROJECT_ID ||
    !e.ENNOIA_AGENT_HASH ||
    !e.ENNOIA_ENDPOINT_URL
  ) {
    throw new Error(
      "[ennoia] missing env: ENNOIA_API_TOKEN / ENNOIA_PROJECT_ID / ENNOIA_AGENT_HASH / ENNOIA_ENDPOINT_URL",
    );
  }

  const body = {
    hash: e.ENNOIA_AGENT_HASH,
    params: input.params ?? {},
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: input.userText }],
      },
    ],
  };

  const timeoutMs = input.timeoutMs ?? 90_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(e.ENNOIA_ENDPOINT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        project: e.ENNOIA_PROJECT_ID,
        apiKey: e.ENNOIA_API_TOKEN,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `[ennoia] HTTP ${res.status}: ${rawText.slice(0, 500)}`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    throw new Error(`[ennoia] non-JSON response: ${rawText.slice(0, 500)}`);
  }

  const text = extractAssistantText(raw);
  if (!text) {
    throw new Error(
      `[ennoia] could not extract assistant text. raw=${JSON.stringify(raw).slice(0, 1000)}`,
    );
  }
  return { text, raw, status: res.status };
}

/**
 * 다양한 응답 스키마에서 어시스턴트 텍스트 추출.
 * OpenAI / Anthropic / ennoia 자체 포맷 모두 fallback.
 */
function extractAssistantText(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;

  // 1. OpenAI 스타일: choices[0].message.content
  const choices = r.choices as unknown;
  if (Array.isArray(choices) && choices[0]) {
    const c0 = choices[0] as Record<string, unknown>;
    const msg = c0.message as Record<string, unknown> | undefined;
    const content = msg?.content;
    if (typeof content === "string" && content.trim()) return content;
    // Anthropic 스타일: content = [{type:'text', text:'...'}]
    if (Array.isArray(content)) {
      const joined = content
        .map((p) => {
          if (typeof p === "string") return p;
          const obj = p as Record<string, unknown>;
          if (obj.type === "text" && typeof obj.text === "string") return obj.text;
          return "";
        })
        .filter(Boolean)
        .join("\n");
      if (joined.trim()) return joined;
    }
    // delta (스트리밍 잔여) — 우선순위 낮음
    const delta = c0.delta as Record<string, unknown> | undefined;
    if (delta && typeof delta.content === "string") return delta.content as string;
  }

  // 2. ennoia 자체 포맷 후보
  if (typeof r.output === "string" && (r.output as string).trim()) {
    return r.output as string;
  }
  if (typeof r.text === "string" && (r.text as string).trim()) {
    return r.text as string;
  }
  const result = r.result as Record<string, unknown> | undefined;
  if (result) {
    if (typeof result.text === "string" && (result.text as string).trim()) {
      return result.text as string;
    }
    if (typeof result.output === "string" && (result.output as string).trim()) {
      return result.output as string;
    }
    if (typeof result.content === "string" && (result.content as string).trim()) {
      return result.content as string;
    }
  }
  // 3. Anthropic 스타일 (최상위 content 배열)
  const topContent = r.content as unknown;
  if (Array.isArray(topContent)) {
    const joined = topContent
      .map((p) => {
        if (typeof p === "string") return p;
        const obj = p as Record<string, unknown>;
        if (obj.type === "text" && typeof obj.text === "string") return obj.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
    if (joined.trim()) return joined;
  }

  // 4. data wrapper
  const dataField = r.data as Record<string, unknown> | undefined;
  if (dataField) return extractAssistantText(dataField);

  return undefined;
}
