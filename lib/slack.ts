import { WebClient } from "@slack/web-api";
import { env } from "./env";

let client: WebClient | undefined;

export function slack(): WebClient {
  if (client) return client;
  client = new WebClient(env().SLACK_BOT_TOKEN);
  return client;
}

/**
 * 일관된 발송 인터페이스.
 * - DRY_RUN=true 면 채널/DM 모두 운영진 본인 DM 으로 우회 (원래 대상은 prefix로 표시)
 * - DRY_RUN=false 면 그대로 발송
 */
export async function postMessage(input: {
  channel: string;
  text: string;
  blocks?: unknown[];
  /** 있으면 해당 thread 안에 reply로 게시. 없으면 새 top-level 메시지. */
  threadTs?: string;
}): Promise<{ ts?: string; channel?: string; dryRun: boolean }> {
  const e = env();
  // ai-줍줍 채널은 참가자 자발적 게시 영역. 봇은 read-only.
  if (
    e.SLACK_AI_JUBJUB_CHANNEL_ID &&
    input.channel === e.SLACK_AI_JUBJUB_CHANNEL_ID
  ) {
    throw new Error(
      "[slack] postMessage to ai-jubjub channel is forbidden (read-only policy)",
    );
  }
  if (e.DRY_RUN) {
    const wrapped = `[DRY_RUN → 원래 대상: ${input.channel}${input.threadTs ? ` thread:${input.threadTs}` : ""}]\n${input.text}`;
    const r = await slack().chat.postMessage({
      channel: e.SLACK_ADMIN_USER_ID,
      text: wrapped,
    });
    return { ts: r.ts, channel: r.channel, dryRun: true };
  }
  const r = await slack().chat.postMessage({
    channel: input.channel,
    text: input.text,
    blocks: input.blocks as never,
    thread_ts: input.threadTs,
  });
  return { ts: r.ts, channel: r.channel, dryRun: false };
}

/**
 * 스크럼 양식 공지 메시지의 ts 자동 탐지.
 * scrum_date 자정 기준 lookback 시간(기본 72h)부터 메시지 스캔 →
 * 운영진 또는 봇이 발화한 + '위클리스크럼' 키워드 포함 메시지 중 최신 1건 반환.
 */
export async function findScrumAnnounceTs(input: {
  channelId: string;
  scrumDateYmd: string; // YYYY-MM-DD (KST)
  adminUserId: string;
  lookbackHours?: number;
}): Promise<string | undefined> {
  const lookbackH = input.lookbackHours ?? 72;
  // KST 자정 → UTC ms
  const scrumStartKstMs = new Date(input.scrumDateYmd + "T00:00:00+09:00").getTime();
  const sinceMs = scrumStartKstMs - lookbackH * 3600 * 1000;
  const sinceTs = (sinceMs / 1000).toFixed(6);

  const messages = await fetchChannelMessagesSince(input.channelId, sinceTs);
  const auth = await slack().auth.test();
  const botUserId = auth.user_id as string;

  const candidates = messages
    .filter((m) => !!m.user && (m.user === input.adminUserId || m.user === botUserId))
    .filter((m) => /위클리\s?스크럼/.test((m.text ?? "").slice(0, 200)))
    .sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts)); // 최신 우선

  return candidates[0]?.ts;
}

export async function notifyAdmin(text: string): Promise<void> {
  const e = env();
  await slack().chat.postMessage({
    channel: e.SLACK_ADMIN_USER_ID,
    text,
  });
}

/** 채널 멤버 목록 (봇 자신 제외). */
export async function listChannelMembers(channelId: string): Promise<string[]> {
  const members: string[] = [];
  let cursor: string | undefined;
  // bot 자신의 user_id 도 제외해야 미제출자 계산이 정확
  const auth = await slack().auth.test();
  const botUserId = auth.user_id as string;

  do {
    const r = await slack().conversations.members({
      channel: channelId,
      cursor,
      limit: 200,
    });
    for (const m of r.members ?? []) {
      if (m === botUserId) continue;
      members.push(m);
    }
    cursor = r.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return members;
}

/**
 * 특정 thread 의 모든 reply(+ parent) 가져오기.
 * 참가자들이 양식 공지 thread 안에 댓글로 스크럼 작성하는 패턴에 필수.
 */
export async function fetchThreadReplies(
  channelId: string,
  threadTs: string,
): Promise<{ ts: string; user?: string; text?: string }[]> {
  const all: { ts: string; user?: string; text?: string }[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const r = await slack().conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 200,
      cursor,
    });
    for (const m of r.messages ?? []) {
      if (!m.ts) continue;
      all.push({ ts: m.ts, user: m.user, text: m.text });
    }
    cursor = r.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  return all;
}

/** 채널의 특정 시점 이후 메시지를 페이징 없이 가져옴 (최대 1000건). */
export async function fetchChannelMessagesSince(
  channelId: string,
  oldestTs: string,
): Promise<{ ts: string; user?: string; text?: string }[]> {
  const all: { ts: string; user?: string; text?: string }[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const r = await slack().conversations.history({
      channel: channelId,
      oldest: oldestTs,
      limit: 200,
      cursor,
    });
    for (const m of r.messages ?? []) {
      if (!m.ts) continue;
      all.push({ ts: m.ts, user: m.user, text: m.text });
    }
    cursor = r.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  return all;
}
