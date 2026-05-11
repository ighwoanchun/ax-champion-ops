/**
 * Slack 채널 멤버 → Sheets `participants` 탭 1회 동기화.
 *
 * 정책:
 *  - Slack 채널 멤버를 source of truth 로 보고, Sheets 에 없는 멤버는 새 행으로 추가
 *  - Sheets 에 이미 있는 멤버는 name/email 만 갱신, 나머지 컬럼(team, status, memo)은 보존
 *  - 봇 자신은 제외
 *
 * 사용:
 *   npm run sync:participants
 */

import { env } from "../lib/env";
import { listChannelMembers, slack } from "../lib/slack";
import { listParticipants, writeParticipants, type ParticipantRow } from "../lib/sheets";

async function main() {
  const e = env();

  console.log("[sync] fetching channel members...");
  const memberIds = await listChannelMembers(e.SLACK_CHANNEL_ID);
  console.log(`[sync] ${memberIds.length} members found.`);

  // Slack 사용자 정보 일괄 조회
  const userInfo = new Map<string, { name: string; email: string }>();
  for (const id of memberIds) {
    try {
      const u = await slack().users.info({ user: id });
      const profile = u.user?.profile;
      const name = profile?.real_name || profile?.display_name || u.user?.name || id;
      const email = profile?.email || "";
      userInfo.set(id, { name, email });
    } catch (err) {
      console.warn(`[sync] users.info failed for ${id}:`, err);
      userInfo.set(id, { name: id, email: "" });
    }
  }

  // Sheets 기존 데이터 로드
  console.log("[sync] loading existing Sheets rows...");
  const existing = await listParticipants();
  const existingMap = new Map(existing.map((r) => [r.slackUserId, r]));

  const merged: ParticipantRow[] = [];
  // 기존 행은 순서 유지하면서 갱신
  for (const row of existing) {
    if (memberIds.includes(row.slackUserId)) {
      const u = userInfo.get(row.slackUserId);
      merged.push({
        ...row,
        name: u?.name || row.name,
        email: u?.email || row.email,
        status: row.status || "active",
      });
    } else {
      // 채널에서 빠진 사람은 status=dropped 표시 (운영진이 수동 확정 가능)
      merged.push({
        ...row,
        status: row.status === "active" ? "dropped" : row.status,
      });
    }
  }
  // 신규 멤버 추가
  for (const id of memberIds) {
    if (existingMap.has(id)) continue;
    const u = userInfo.get(id)!;
    merged.push({
      slackUserId: id,
      name: u.name,
      email: u.email,
      teamRound1: "",
      teamTypeRound1: "",
      teamRound2: "",
      teamTypeRound2: "",
      status: "active",
      droppedAt: "",
      memo: "",
    });
  }

  console.log(`[sync] writing ${merged.length} rows to Sheets...`);
  await writeParticipants(merged);
  console.log("[sync] done.");
}

main().catch((err) => {
  console.error("[sync] failed:", err);
  process.exit(1);
});
