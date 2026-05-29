/**
 * §6 슬랙 메시지 템플릿. 각 함수는 placeholder 를 채워 최종 텍스트를 반환.
 */

import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const KST = "Asia/Seoul";
const wd = ["일", "월", "화", "수", "목", "금", "토"];

function fmtKstDate(d: Date): string {
  const z = toZonedTime(d, KST);
  return `${format(z, "M/d")}(${wd[z.getDay()]})`;
}

/** §6-A 오프라인 공유회 안내 (월 오전) */
export function msgOfflineAnnouncement(input: {
  wedDate: Date;
  meetingPlace?: string;
  hour?: number; // 14 = 14:00
}): string {
  const place = input.meetingPlace ?? "[회의실 미정]";
  const time = input.hour ? `오후 ${input.hour - 12}시` : "오후 [시간 미정]";
  return [
    "📌 이번 주 수요일은 오프라인 전체 공유회입니다!",
    `일시: ${fmtKstDate(input.wedDate)} ${time}`,
    `장소: ${place}`,
    "지난 2주간의 진행 현황을 공유해 주세요.",
    "한 명당 3~5분 발표 + 1~2분 Q&A로 진행됩니다.",
    "",
    "💡 결과만이 아니라 시도했다가 막혔던 부분, 도구 선택 이유,",
    "실패 경험까지 함께 공유해 주시면 다 같이 배웁니다.",
  ].join("\n");
}

/** §6-B 슬랙 스크럼 안내 (월 오전) */
export function msgScrumAnnouncement(input: { wedDate: Date }): string {
  return [
    "📌 이번 주 수요일은 슬랙 스크럼입니다!",
    "오프라인 공유회가 없는 주이지만 매주 수요일 = 공유의 날 원칙에 따라",
    "전원 필수로 진행합니다.",
    "",
    `📅 마감: ${fmtKstDate(input.wedDate)} 18:00`,
    "🧷 양식 (그대로 복사해서 사용):",
    "",
    "📌 위클리 스크럼 — [이름]",
    "✅ 지난 2주간 한 것:",
    "🎯 다음 2주간 할 것:",
    "🚧 막힌 것 / 도움 필요:",
  ].join("\n");
}

/** §6-D' 미제출자 채널 안내 (수 15시) — A3 */
export function msgUnsubmittedReminder(input: {
  unsubmittedUserIds: string[];
}): string {
  const mentions = input.unsubmittedUserIds.map((u) => `<@${u}>`).join(" ");
  return [
    "📌 위클리 스크럼 미제출자 안내",
    "",
    mentions,
    "",
    "오늘 18시까지 위 양식으로 스크럼 부탁드립니다 🙏",
    "막힌 부분이 있으면 그것만 적어주셔도 충분합니다.",
    "",
    "📋 양식",
    "✅ 지난 2주간 한 것",
    "🎯 다음 2주간 할 것",
    "🚧 막힌 것 / 도움 필요",
  ].join("\n");
}

/** A3 — 전원 제출 완료 시 게시 */
export function msgAllSubmitted(): string {
  return "🎉 이번 주 위클리 스크럼 전원 제출 완료! 다들 수고하셨어요.";
}

/** A4 — 운영진 DM 으로 보내는 마감 요약 */
export function msgFinalizeAdminReport(input: {
  weekNumber: number;
  scrumDate: Date;
  submittedCount: number;
  totalCount: number;
  unsubmittedNames: string[];
  aiJubjubStats?: {
    total: number;
    requiredPerPerson: number;
    missed: { name: string; count: number }[];
  };
}): string {
  const lines = [
    `📊 *W${input.weekNumber} 슬랙 스크럼 마감 요약 (${fmtKstDate(input.scrumDate)} 18:00)*`,
    `제출: ${input.submittedCount} / ${input.totalCount}`,
  ];
  if (input.unsubmittedNames.length > 0) {
    lines.push(`미제출자: ${input.unsubmittedNames.join(", ")}`);
  } else {
    lines.push("✅ 전원 제출 완료");
  }
  if (input.aiJubjubStats) {
    const s = input.aiJubjubStats;
    lines.push("");
    lines.push("📤 *ai-줍줍 게시 현황 (지난 7일)*");
    lines.push(`전체 게시: ${s.total}건`);
    if (s.missed.length === 0) {
      lines.push(`✅ 전원 주 ${s.requiredPerPerson}건 충족`);
    } else {
      const missedStr = s.missed
        .map((m) => `${m.name}(${m.count}건)`)
        .join(", ");
      lines.push(`주 ${s.requiredPerPerson}건 미달: ${missedStr}`);
    }
  }
  return lines.join("\n");
}

/** 스크럼 메시지 식별자: '📌 위클리 스크럼' 으로 시작하는 본인 발화 */
export function isScrumSubmission(text?: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return /^📌\s*위클리\s*스크럼/.test(trimmed);
}

/** 스크럼 본문에 '🚧 막힌 것' 섹션이 있는지 + 내용 유무 */
export function hasBlockerSection(text?: string): boolean {
  if (!text) return false;
  const m = text.match(/🚧[^\n]*\n([\s\S]*?)(?:\n\n|$)/);
  if (!m) return false;
  const body = m[1].trim();
  return body.length > 0 && body !== "없음" && body !== "-";
}
