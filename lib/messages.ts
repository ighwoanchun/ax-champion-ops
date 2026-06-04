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

/**
 * A1 / 슬랙 주차 announce — 월요일 09시. 한 줄 격려.
 */
export function msgScrumAnnouncement(_input: { wedDate: Date }): string {
  return "이번 주 공유는 슬랙 스크럼입니다. 다들 한주 힘내시고 화이팅 하세요.";
}

/**
 * A1 / 오프라인 주차 announce — 월요일 09시. 한 줄 격려.
 */
export function msgOfflineAnnouncement(_input: {
  wedDate: Date;
  meetingPlace?: string;
  hour?: number;
}): string {
  return "이번 주 공유는 오프라인 공유회입니다. 다들 한주 힘내시고 화이팅 하세요.";
}

/**
 * A2 / 스크럼 당일 양식 안내 — scrum_date 09시 (slack 주차만).
 * 채널에 게시. 참가자가 본 쓰레드에 양식 채워서 댓글로 공유.
 */
export function msgScrumDayForm(): string {
  return [
    "📌 오늘은 위클리 스크럼이 있는 날입니다.",
    "",
    "한 주간 진행되었던 내용을 다음 양식에 기입하여 본 쓰레드에 공유 부탁드립니다.",
    "많은 진전이 아니더라도 공유해주시면 됩니다.",
    "",
    "* 위클리스크럼 - [이름]",
    "* 지난 2주간 한것:",
    "* 다음 2주간 할것:",
    "* 막힌것/도움필요:",
  ].join("\n");
}

/**
 * A3 / 중간 현황 안내 — scrum_date 15시 (slack 주차만).
 * 제출자 N명 칭찬 + 아직 작성 중인 분 멘션 (긍정 톤).
 */
export function msgScrumMidStatus(input: {
  submittedCount: number;
  unsubmittedUserIds: string[];
}): string {
  const lines = [
    "📊 오늘 위클리 스크럼 중간 현황",
    "",
    `✅ ${input.submittedCount}명 제출 완료! 감사합니다 🙏`,
  ];
  if (input.unsubmittedUserIds.length > 0) {
    const mentions = input.unsubmittedUserIds.map((u) => `<@${u}>`).join(" ");
    lines.push(
      "",
      `아직 작성 중이신 분 — ${mentions}`,
      "오늘 18시까지 본 쓰레드에 한 주간 진행 내용 공유 부탁드립니다.",
      "짧아도 괜찮고, 막힌 부분만 적어주셔도 충분합니다.",
    );
  }
  return lines.join("\n");
}

/** A3 — 전원 제출 완료 시 게시 */
export function msgAllSubmitted(): string {
  return "🎉 이번 주 위클리 스크럼 전원 제출 완료! 다들 수고하셨어요.";
}

/**
 * A4 / 익일 마감 요약 — scrum_date + 1일 10시 운영진 DM.
 * ai-줍줍 섹션은 게시자 명단(긍정 톤). 미달자 노출 X.
 * confluenceUrl 이 있으면 자동 생성된 주간 리포트 링크 표시.
 */
export function msgFinalizeAdminReport(input: {
  weekNumber: number;
  scrumDate: Date;
  submittedCount: number;
  totalCount: number;
  unsubmittedNames: string[];
  aiJubjubStats?: {
    total: number;
    posters: { name: string; count: number }[];
  };
  confluenceUrl?: string;
}): string {
  const lines = [
    `📊 *W${input.weekNumber} 슬랙 스크럼 마감 요약 (${fmtKstDate(input.scrumDate)} 기준)*`,
    `제출: ${input.submittedCount} / ${input.totalCount}`,
  ];
  if (input.unsubmittedNames.length > 0) {
    lines.push(`미제출자: ${input.unsubmittedNames.join(", ")}`);
  } else {
    lines.push("✅ 전원 제출 완료");
  }
  if (input.aiJubjubStats) {
    const s = input.aiJubjubStats;
    lines.push("", "📤 *ai-줍줍 게시 현황 (지난 7일)*", `전체 게시: ${s.total}건`);
    if (s.posters.length === 0) {
      lines.push("아직 게시자가 없습니다.");
    } else {
      const posterCount = s.posters.length;
      const posterTotal = s.posters.reduce((a, p) => a + p.count, 0);
      lines.push(`1건 이상 게시: ${posterCount}명 (${posterTotal}건)`);
      const list = s.posters
        .slice()
        .sort((a, b) => b.count - a.count)
        .map((p) => `${p.name}(${p.count}건)`)
        .join(", ");
      lines.push(`게시자: ${list}`);
    }
  }
  if (input.confluenceUrl) {
    lines.push("", `📄 *주간 리포트 자동 생성*`, `<${input.confluenceUrl}|Confluence 페이지 열기>`);
  }
  return lines.join("\n");
}

/**
 * 운영진 수동 트리거 — 주간 리포트 채널 공유 메시지.
 * A4 자동 발화 후 운영진이 Confluence 페이지 검토를 마치고 명령으로 발송.
 */
export function msgShareWeeklyReport(input: {
  weekNumber: number;
  scrumDate: Date;
  confluenceUrl: string;
}): string {
  return [
    `📄 W${input.weekNumber} 주간 리포트가 올라왔습니다 (${fmtKstDate(input.scrumDate)} 스크럼 기준).`,
    "",
    `<${input.confluenceUrl}|Confluence 페이지 열기>`,
    "",
    "지난 한 주의 진척과 도움 요청을 정리해두었습니다. 시간 되실 때 한번 확인 부탁드립니다 🙏",
  ].join("\n");
}

/**
 * 스크럼 제출 메시지 식별.
 * 새 양식: '* 위클리스크럼 - [이름]' (이모지·별표 유무 무관).
 * 본문 첫 100자 내에 '위클리스크럼' 또는 '위클리 스크럼' 이 포함되면 제출로 간주.
 */
export function isScrumSubmission(text?: string): boolean {
  if (!text) return false;
  const head = text.trim().slice(0, 100);
  return /위클리\s?스크럼/.test(head);
}

/**
 * 스크럼 메시지 본문을 4 섹션으로 파싱.
 * - 이름 (양식 첫 줄에서 추출)
 * - 지난 2주간 한 것
 * - 다음 2주간 할 것
 * - 막힌 것 / 도움 필요
 *
 * 구 양식("📌 위클리 스크럼 — [이름]") + 신 양식("* 위클리스크럼 - [이름]") 모두 지원.
 */
export interface ParsedScrumSubmission {
  name?: string;
  done?: string;
  next?: string;
  blocker?: string;
  raw: string;
}

export function parseScrumSubmission(text?: string): ParsedScrumSubmission | undefined {
  if (!text) return undefined;
  const t = text.trim();
  if (!/위클리\s?스크럼/.test(t.slice(0, 100))) return undefined;

  // 이름: 첫 줄에서 - 또는 — 뒤
  const firstLine = t.split("\n")[0] ?? "";
  const nameMatch = firstLine.match(/위클리\s?스크럼\s*[-—]\s*(.+?)\s*$/);
  const name = nameMatch?.[1]?.replace(/\[|\]/g, "").trim();

  // 섹션 추출 헬퍼: 헤더 패턴(이모지 또는 텍스트 둘 다) → 다음 헤더 직전까지
  const extract = (headerPatterns: RegExp[]): string | undefined => {
    for (const hp of headerPatterns) {
      const m = t.match(hp);
      if (!m) continue;
      const startIdx = (m.index ?? -1) + m[0].length;
      if (startIdx <= 0) continue;
      const rest = t.slice(startIdx);
      // 다음 헤더 시작 위치 (이모지 또는 *  + 한국어 키워드) — 너무 광범위하지 않게
      const nextHeaderIdx = rest.search(/(\n\s*[\*\-•]?\s*)?(✅|🎯|🚧|지난\s*2주간|다음\s*2주간|막힌\s*것|도움\s*필요)/);
      const body = nextHeaderIdx >= 0 ? rest.slice(0, nextHeaderIdx) : rest;
      const cleaned = body
        .replace(/^[\s:\-\*•]+/, "")
        .trim();
      if (cleaned) return cleaned;
    }
    return undefined;
  };

  const done = extract([
    /✅[^\n]*?(?:한\s*것)?[^\n]*:/,
    /지난\s*2주간\s*한\s*것\s*:/,
  ]);
  const next = extract([
    /🎯[^\n]*?(?:할\s*것)?[^\n]*:/,
    /다음\s*2주간\s*할\s*것\s*:/,
  ]);
  const blocker = extract([
    /🚧[^\n]*?(?:막힌)[^\n]*:/,
    /막힌\s?것\s?\/?\s?도움\s?필요\s*:/,
  ]);

  return { name, done, next, blocker, raw: t };
}

/**
 * 스크럼 본문에 '막힌것/도움필요' 또는 '🚧 막힌 것' 섹션이 있는지 + 내용 유무.
 * 새 양식과 구 양식 모두 인식.
 */
export function hasBlockerSection(text?: string): boolean {
  if (!text) return false;
  // 구 양식: 🚧 막힌 것 / 도움 필요:
  // 신 양식: * 막힌것/도움필요 :
  const m = text.match(/(?:🚧[^\n]*|막힌\s?것\s?\/?\s?도움\s?필요\s*:?)\s*\n([\s\S]*?)(?:\n\n|$)/);
  if (!m) return false;
  const body = m[1].trim();
  return body.length > 0 && body !== "없음" && body !== "-" && body !== "X";
}

/**
 * ai-줍줍 채널 메시지가 참가자 자발적 게시물인지 판별.
 * - 너무 짧은 메시지 (50자 미만) 제외
 * - 운영 공지 키워드 포함 시 제외
 */
const JUBJUB_ANNOUNCEMENT_KEYWORDS = [
  ":loudspeaker:",
  ":mega:",
  "📢",
  "📣",
  "수상자 발표",
  "수상자",
  "[공지]",
  "[안내]",
  "[운영]",
];
const JUBJUB_MIN_LENGTH = 50;

export function isJubjubProjectPost(text?: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < JUBJUB_MIN_LENGTH) return false;
  for (const kw of JUBJUB_ANNOUNCEMENT_KEYWORDS) {
    if (trimmed.includes(kw)) return false;
  }
  return true;
}
