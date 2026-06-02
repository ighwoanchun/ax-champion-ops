/**
 * 주간 리포트 자동 생성: 스크럼 데이터 → ennoia 분석 → Confluence 페이지 게시.
 * A4 핸들러가 호출. 실패해도 A4 전체를 막지 않도록 try-catch 로 호출하는 쪽에서 감쌈.
 */

import { env } from "./env";
import { runEnnoiaAgent } from "./ennoia";
import {
  absoluteWebUrl,
  createConfluencePage,
  markdownToStorage,
} from "./confluence";
import { parseScrumSubmission } from "./messages";
import type { ParticipantRow } from "./sheets";
import { recordAuditLog } from "./db";

export interface WeeklyReportSubmission {
  slackUserId: string;
  name: string;
  team: string;
  track: string;
  cohort: "1·2기" | "2기" | "신규" | string;
  submission: {
    done?: string;
    next?: string;
    blocker?: string;
    raw: string;
  } | null;
}

export interface GenerateReportInput {
  weekNumber: number;
  scrumDate: string; // YYYY-MM-DD
  participants: WeeklyReportSubmission[];
}

export interface GenerateReportResult {
  pageId: string;
  url: string;
}

/**
 * ennoia 분석 + Confluence 페이지 생성.
 * 환경변수 미주입 시 undefined 반환 (A4 본체는 정상 진행).
 */
export async function generateAndPublishWeeklyReport(
  input: GenerateReportInput,
): Promise<GenerateReportResult | undefined> {
  const e = env();
  const ready =
    e.ENNOIA_API_TOKEN &&
    e.ENNOIA_PROJECT_ID &&
    e.ENNOIA_AGENT_HASH &&
    e.ENNOIA_ENDPOINT_URL &&
    e.ATLASSIAN_API_TOKEN &&
    e.ATLASSIAN_EMAIL &&
    e.ATLASSIAN_CLOUD_ID &&
    e.CONFLUENCE_PARENT_PAGE_ID;
  if (!ready) {
    console.log("[weekly-report] ennoia/atlassian env not fully configured; skipping");
    return undefined;
  }

  // 1. ennoia 분석 요청 (JSON.stringify 된 사용자 메시지)
  const userPayload = JSON.stringify({
    weekNumber: input.weekNumber,
    scrumDate: input.scrumDate,
    participants: input.participants,
  });

  let ennoiaText: string;
  let ennoiaRaw: unknown;
  try {
    const res = await runEnnoiaAgent({ userText: userPayload });
    ennoiaText = res.text;
    ennoiaRaw = res.raw;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordAuditLog({
      jobName: "A4",
      status: "error",
      errorMessage: `ennoia: ${msg}`,
      payload: { weekNumber: input.weekNumber, stage: "ennoia" },
    });
    throw err;
  }

  // 2. 마크다운 → Confluence storage(XHTML) 변환
  const storageBody = markdownToStorage(ennoiaText);

  // 3. Confluence 페이지 생성
  const title = `${input.weekNumber}주차 실행 현황 (W${input.weekNumber}: ${input.scrumDate})`;
  try {
    const page = await createConfluencePage({
      parentId: e.CONFLUENCE_PARENT_PAGE_ID!,
      title,
      body: storageBody,
      representation: "storage",
    });
    const url = absoluteWebUrl(page.webui);
    await recordAuditLog({
      jobName: "A4",
      status: "success",
      payload: {
        weekNumber: input.weekNumber,
        stage: "confluence",
        pageId: page.id,
        url,
        ennoiaRawSample: typeof ennoiaRaw === "object" ? Object.keys(ennoiaRaw as object).slice(0, 20) : null,
      },
    });
    return { pageId: page.id, url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordAuditLog({
      jobName: "A4",
      status: "error",
      errorMessage: `confluence: ${msg}`,
      payload: { weekNumber: input.weekNumber, stage: "confluence" },
    });
    throw err;
  }
}

/**
 * Slack participants 시트 row + 채널 스크럼 메시지 → ennoia 입력 형식 변환.
 */
export function buildSubmissionsForReport(
  participants: ParticipantRow[],
  submitterMessages: Map<string, { ts: string; text: string }>,
): WeeklyReportSubmission[] {
  return participants.map((p) => {
    const sub = submitterMessages.get(p.slackUserId);
    const parsed = sub ? parseScrumSubmission(sub.text) : undefined;
    const cohortFromMemo = pickCohortFromMemo(p.memo);
    return {
      slackUserId: p.slackUserId,
      name: p.name,
      team: p.teamRound1 || "",
      track: p.teamTypeRound1 || "",
      cohort: cohortFromMemo ?? "신규",
      submission: parsed
        ? {
            done: parsed.done,
            next: parsed.next,
            blocker: parsed.blocker,
            raw: parsed.raw,
          }
        : sub
          ? { raw: sub.text }
          : null,
    };
  });
}

/**
 * W2(2026-05-20) 실제 데이터 기반 더미 제출자 21명.
 * Confluence 페이지 4812505595 §2 표에서 추출.
 * dry-run 검증·페이지 품질 확인용.
 */
const W2_DUMMY_DATA: Array<[
  name: string,
  teamRole: string, // "팀명 · 직무"
  cohort: "1·2기" | "2기" | "신규",
  done: string,
  next: string,
  blocker: string,
]> = [
  ["오채리", "프로덕트디자인팀 · 디자인", "1·2기", "어떤 작업을 할지에 대한 팀 논의", "빌더데이 때 우승한 작업 진행", "아직 진행사항이 없어서 막힌 것이 없어요. 나중에 원티드에 서비스 넣으려면 어떻게 하죠?"],
  ["전익환", "채용사업개발 · 기획/PM", "1·2기", "팀활동 방향·방식 합의 / 주제 고민 (원티드 HR 어시스턴스, 원티드 공고 추천 인플루언서)", "주제 선정 및 프로젝트 진행", "쿠팡파트너스처럼 원티드 공고를 퍼나르고 합격 발생 시 인플루언서에게 보상하는 프로세스의 법적 이슈 확인 필요"],
  ["차승호", "채용솔루션팀 · 개발", "1·2기", "원티드 공고 MCP 설계 및 도구 추가", "Oneid OAuth 연동", "—"],
  ["윤성준", "파트너성장팀 · 세일즈", "1·2기", "세일즈 개인 대시보드 구성 (세일즈맵 대체)", "현 데일리 주간 생산성 지표 고도화 & 주간 리포트화", "팀원 공동 사용을 위한 보안화 인증을 통한 서비스 배포"],
  ["김유진", "글로벌파트너팀 · 운영", "신규", "인재풀 운영 & 헤드헌팅 방향 논의 / 3가지 에이전트로 분류 (한국→해외, 일본→한국, 그 외 해외→한국) / 한국→해외 에이전트 기초 단계 구성, 기준 설립", "한국→해외 에이전트 구성 (인재 판단, 포지션 확인, 메일 초안) / 해외→한국 기초 구성", "현재까지는 없음"],
  ["박형근", "PO팀 · 기획/PM", "2기", "신규 BM 리서치 및 기획", "기획 고도화 및 랜딩페이지 제작", "현재까지 없음"],
  ["김성애", "채용사업팀 · 운영", "2기", "메일로 숨합 찾기 / 기업향 도우미 / 스크립트 짜기 + 슬랙 연동 / 익스텐션 제작 중", "쿼리 권한/대용량 데이터 이슈 해결 방법 모색 / 문의경로 슬랙 연동 + 기능 추가", "대용량 데이터 처리로 한계 봉착 — 쿼리 권한 이슈 확인 및 API 사용 고려 체크 도움 요청"],
  ["고병민", "마케팅팀 · 마케팅", "신규", "앱 푸시 CRM 기업 문구 변화 (뉴스봇 구축) / 엔노이아 이해 / 에이전트 생성 및 시스템 메시지 구축", "API 커넥터 및 문서 폴더 설정 / 슬랙 연동", "현재까지 없음"],
  ["남기혁", "후보자경험2팀 · 개발", "2기", "아이디어 도출", "skeleton 작성", "—"],
  ["손민현", "PO팀 · 기획/PM", "2기", "실험 협의 속도 개선 — 엔노이아 에이전트 2건 개발 / 엔노이아 에이전트 2건 방향 정리 (PRD 완성)", "엔노이아 Connect에서 Amplitude/빅쿼리 연동 가능 여부 확인 / 임팩트 측정 에이전트 개발 시작", "—"],
  ["정소연", "피플팀 · HR", "신규", "근태 대시보드 표준편차/평균근무 지표 추가 / 챔피온 기간 프로젝트 구상", "노무(근로감독) 검토 에이전트 워크플로우 구축 / 인사운영 스케줄링 봇 프롬프트 작성", "엔노이아에 내부 민감 정보(개인 정보 등)를 암호화하여 정보 보호하는 것이 가능할지"],
  ["이요한", "채용솔루션팀 · 개발", "2기", "어떤 작업 할지에 아이디어 구상", "구상된 아이디어 구체화 및 작업 계획 수립 / ennoia 익숙해지기", "—"],
  ["박연빈", "후보자경험2팀 · 개발", "신규", "작업 아이디어 구상 및 아이템 선정", "구상된 아이디어 구체화 및 작업 계획 수립 / ennoia 익숙해지기", "—"],
  ["이원희", "파트너성장팀 · 운영", "1·2기", "3가지 아이디어 구상 정리 — 세일즈덱 생성 에이전트 / approve-harness 무인 자동화(기업승인) / 오피스 촬영 운영 대시보드", "정리된 구상안 바탕으로 실체화 진행 / 세부 추가·수정 대응", "없음"],
  ["이서연", "채용사업팀 · 운영", "신규", "주제 고민 — 채용수수료 카드결제 정산 자동화 (포트원 연동)", "포트원 Webhook으로 결제/환불 이벤트 실시간 수신 / Google Apps Script로 Google Sheets 자동 계산", "현재까지 없음"],
  ["장수지", "PO팀 · 기획/PM", "1·2기", "아이템 선정 — (1) 가벼운 테스트 후 경력 인증 유도 (2) 해외 취업 멘토 에이전트 (글로벌파트너팀 니즈 확인 완료, Ennoia 페르소나 셋팅 구상 중)", "경력 인증 구현 / Ennoia에서 멘토 페르소나 셋팅", "경력 인증 너무 어렵습니다. 해보다가 도움 필요하면 요청 예정"],
  ["김태경", "채용사업팀 · 운영", "1·2기", "아이템 고민 — (1) 정산운영 콜 채널 구축 (2) 합격자 설문지 자동화 (3) 합격자 행동 넛지 봇 / 기존 업무가 바빠 아이템만 고민하고 시작 못함", "아이템 중 작업순서 정하고 시작하기", "시트 ↔ HQ 연결 방법 — 시트에서 특정지원번호 클릭 시 HQ에서 합격처리 되는 형태"],
  ["조성윤", "채용사업팀 · 운영", "2기", "프로젝트 목표 및 주제 설정 / 자동화 이전에 작업 기준 수립", "작업 기준 테스트 (실제 데이터와 수기 대조 후 기준 고도화) / 스프레드시트 내 자동 업데이트", "—"],
  ["장진희", "피플팀 · HR", "신규", "수립-체크인-회고를 지원하는 AI Agent 주제 설정 / 성과관리 에이전트 PRD 정리 및 구현", "수립 단계 구현 — 조직 OKR·개인미션 가이드 챗봇 학습 + 테스트·적용", "사내 보안 검토 필요 — 클로드코드 + Prisma Studio + GCP, 구성원 구글계정·조직 정보·OKR 데이터 활용 / 엔노이아 연결 방법 추후 도움 요청 가능성"],
  ["우연서", "후보자경험1팀 · 개발", "1·2기", "작업 항목 정리 및 문서 초안 작성 / 프론트 스킬 모니터링 보드 초안 개발 / 백야드 v2에 배포", "보드 통계 정합성 확인 / 챕터 공유 후 피드백 / 옵스 엔노이아 마이그레이션 시작", "—"],
  ["김민정", "글로벌파트너팀 · 기타", "1·2기", "아이템 고민 — 미래내일일경험인턴 관리 대시보드", "대시보드 UI 업데이트 (인턴/멘토/관리자용) / 엔노이아 에이전트-클로드 연동", "현재까지는 없음"],
];

export function buildW2DummySubmissions(): WeeklyReportSubmission[] {
  return W2_DUMMY_DATA.map(([name, teamRole, cohort, done, next, blocker], i) => {
    const [team, role] = teamRole.split(" · ");
    return {
      slackUserId: `U_DUMMY_${i.toString().padStart(2, "0")}`,
      name,
      team: team ?? "",
      track: role ?? "",
      cohort,
      submission: {
        done,
        next,
        blocker,
        raw: `* 위클리스크럼 - ${name}\n* 지난 2주간 한것: ${done}\n* 다음 2주간 할것: ${next}\n* 막힌것/도움필요: ${blocker}`,
      },
    };
  });
}

/**
 * memo 컬럼에서 cohort 정보 추출 (없으면 undefined).
 * 운영진이 시트에 "1·2기", "2기", "신규" 같이 적어두면 인식.
 */
function pickCohortFromMemo(memo: string): string | undefined {
  if (!memo) return undefined;
  if (/1·2기|1\.2기|1·2|1·2/.test(memo)) return "1·2기";
  if (/\b2기\b/.test(memo)) return "2기";
  if (/신규|new/i.test(memo)) return "신규";
  return undefined;
}
