/**
 * Google Gemini API 클라이언트.
 * 인증: x-goog-api-key 헤더.
 * 모델: gemini-2.5-pro 기본 (긴 출력 안정, 1M context, 한국어 우수).
 *
 * 응답 구조 (OpenAI 와 다름):
 *   candidates[0].content.parts[0..n].text  → 합쳐서 본문
 *   usageMetadata: { promptTokenCount, candidatesTokenCount, totalTokenCount }
 */

import { env } from "./env";

export interface GeminiCallInput {
  systemMessage: string;
  userText: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiCallResult {
  text: string;
  raw: unknown;
  usage?: GeminiUsage;
}

export async function runGeminiAgent(
  input: GeminiCallInput,
): Promise<GeminiCallResult> {
  const e = env();
  if (!e.GEMINI_API_KEY) {
    throw new Error("[gemini] GEMINI_API_KEY not configured");
  }
  const model = e.GEMINI_MODEL || "gemini-2.5-pro";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = {
    contents: [
      { role: "user", parts: [{ text: input.userText }] },
    ],
    systemInstruction: {
      parts: [{ text: input.systemMessage }],
    },
    generationConfig: {
      temperature: input.temperature ?? 0.3,
      maxOutputTokens: input.maxOutputTokens ?? 32768,
    },
  };

  const timeoutMs = input.timeoutMs ?? 240_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": e.GEMINI_API_KEY,
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
      `[gemini] HTTP ${res.status}: ${rawText.slice(0, 500)}`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    throw new Error(`[gemini] non-JSON response: ${rawText.slice(0, 500)}`);
  }

  const r = raw as Record<string, unknown>;
  const candidates = r.candidates as
    | Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>
    | undefined;

  const parts = candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => p.text ?? "")
    .filter(Boolean)
    .join("");

  if (!text.trim()) {
    throw new Error(
      `[gemini] empty text in response. finishReason=${candidates?.[0]?.finishReason ?? "n/a"} raw=${JSON.stringify(raw).slice(0, 500)}`,
    );
  }

  const usage = r.usageMetadata as GeminiUsage | undefined;
  return { text, raw, usage };
}
