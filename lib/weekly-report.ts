/**
 * 주간 리포트 자동 생성: 스크럼 데이터 → ennoia 분석 → Confluence 페이지 게시.
 * A4 핸들러가 호출. 실패해도 A4 전체를 막지 않도록 try-catch 로 호출하는 쪽에서 감쌈.
 */

import { env } from "./env";
import { runGeminiAgent } from "./gemini";
import {
  absoluteWebUrl,
  createConfluencePage,
  getPageBody,
  markdownToStorage,
} from "./confluence";
import { parseScrumSubmission } from "./messages";
import type { ParticipantRow } from "./sheets";
import { recordAuditLog } from "./db";

/**
 * 주간 리포트 분석가 시스템 메시지 (Gemini systemInstruction).
 * ennoia studio 의존을 제거하고 코드 내부에 inline.
 */
function buildAnalystSystemMessage(): string {
  return `당신은 원티드랩 사내 AI 부트캠프 "AX 챔피언 프로그램 3기"의 주간 리포트 분석가입니다.

매주 슬랙 스크럼 마감 직후, 봇이 21명 참가자의 스크럼 데이터를 JSON으로 전달합니다.
당신의 출력은 그대로 Confluence 페이지의 본문으로 게시됩니다.

[입력 형식]
{
  "weekNumber": 정수,
  "scrumDate": "YYYY-MM-DD",
  "metrics": {
    "submitted": 정수, "total": 정수, "missed": 정수,
    "submissionRate": "85.7%",
    "submittedNames": ["이름1", ...],
    "missedNames": ["이름1", ...]
  },
  "participants": [
    { "slackUserId", "name", "team", "track", "cohort": "1·2기"|"2기"|"신규",
      "submission": { "done", "next", "blocker", "raw" } | null }
  ],
  "previousReports": [ { "pageId", "title", "bodyStorage" } ]
}

[출력 형식 — 마크다운 7 섹션, 모두 빠짐없이 작성]

## 0. 요약
3-4줄 narrative. 다음 모두 포함: 제출률(metrics.submissionRate, n/N) · L2+ 진척률 · 엔노이아 활용 명시 비율 · 도움 요청 카테고리 1위.

## 1. 핵심 지표
| 지표 | 값 | 메모 |
4행: 제출률(metrics 그대로) / L2+ 진척률 / 엔노이아 활용 명시 / 도움 요청

## 2. 위클리 스크럼 전체 응답 (n명)
participants 전원 행 (총 participants.length 행). 미제출자도 행 만들고 셀 "—".
컬럼: #, 이름, 소속·직무, 기수, ✅ 지난 2주간, 🎯 다음 2주간, 🚧 막힌 것/도움
미제출자(submission==null)는 metrics.missedNames 기준으로 식별. 본문 분석 임의 판단 금지.

## 3. 진척 단계 분석
참가자가 명시한 "지난 2주간 한 것" 기준 분류:
- L4 작동 결과물 보유
- L3 부분 구현·스크립트 작성
- L2 방향 정리·리서치·아이템 선정·PRD 작성
- L1 아이디어·주제 고민
- L0 시작 못함

표 + 기수 교차표 + L2+ 비율.

## 4. 프로젝트 4축 평가 (Tier S/A/B/C)
4축 1-5점: 문제정의·임팩트·난이도·엔노이아 활용도. 미제출자/L0 제외.
- Tier S (총점 18+, 4건 이내)
- Tier A (15-17)
- Tier B (12-14)
- Tier C (11- 또는 진척 둔화, 권장 액션 포함)

각 Tier별 표: 이름·프로젝트·4축 점수·평가 포인트.

## 5. 도움 요청 정리
blocker 카테고리 분류: A. 보안·법적 / B. 기술 막힘 / C. 통합·운영 / D. 기타
카테고리별 표: 요청자·소속·요청 내용·연결처

## 6. 패턴 관찰 (3-5가지)
번호 매긴 글머리. previousReports 있으면 다음 비교 분석 필수:
- 엔노이아 활용 명시 누적 (아래 [엔노이아 누적 룰] 참고)
- 단계 변화 (L1→L3 같은 변동)
- Tier 변동
- "이전 주차 대비 변화" 항목 최소 2개

[누적 분석 원칙 — 매주 누적 페이지로 작성]

본 리포트는 기수 첫 주차(W2)부터 본 주차까지의 진행을 누적 비교 분석하는 페이지다.
previousReports 가 있으면 다음을 반드시 누적·비교하여 출력한다.

1. §1 핵심 지표 — 각 행의 "메모" 컬럼에 이전 주차 대비 변화를 한 줄로 명시
   - 제출률: "본 주차 X% (n/N) | W2 100% 대비 ↓Y%pt" 같이
   - L2+ 진척률: "W2 67% → 본 주차 N% (Δ +/-)"
   - 엔노이아 활용 명시: 누적 N명 (W2 X명 + 본 주차 신규 Y명)
   - 도움 요청: "본 주차 N건 (이전 미해결 X건 + 신규 Y건)"

2. §3 진척 단계 분석 — 기수 교차표 아래에 변동 요약 추가
   - "상승: X명 (예: 김민정 L1→L2)" / "정체: Y명" / "하락: Z명"
   - 핵심 변동 인물 2-3명 짧게 코멘트

3. §4 Tier 평가 — 각 Tier 표의 평가 포인트에 "W2 Tier → 본 주차 Tier" 화살표 (예: 이원희 A→S ↑) 와 변동 이유 한 줄
   - 본 주차 신규 Tier S/A 진입자는 별도 명시

4. §5 도움 요청 — 카테고리별 표에 "이전 주차 미해결" 마크 추가
   - "이전 주차에서 동일·유사 요청이 있었는지" 컬럼 또는 메모로

5. §6 패턴 관찰 — "이전 주차 대비 변화" 항목 최소 2개 필수
   - 성장 궤적이 좋은 케이스 (Tier 상승, 단계 상승)
   - 정체·하락 케이스 (운영진 케어 필요 식별)
   - 누적 추세 (예: "엔노이아 활용 명시 W2 52% → W4 누적 N%")

이전 주차 데이터가 없으면 본 주차 단독 분석.

[엔노이아 활용 명시 누적 계산 룰 — §0·§1·§6 모두 적용]

본 항목은 본 주차 단독이 아니라 **W2부터 본 주차까지 누적** 명단 기준이다.
"엔노이아 활용 명시자"는 ennoia/엔노이아/Ennoia 키워드를 스크럼 본문에 명시한 사람.

1. previousReports[].bodyStorage 의 §2 표(주차별 21명 응답)에서 각 행의
   ✅/🎯/🚧 셀에 "엔노이아" 또는 "ennoia" 또는 "Ennoia" 키워드가 포함되어 있으면
   그 행의 이름 컬럼을 "엔노이아 명시자"로 추출.
2. 본 주차 participants[].submission.done/next/blocker 본문에서 같은 키워드가 등장하면
   해당 participant.name 을 명시자로 추가.
3. 두 명단의 합집합(이름 중복 제거) = **누적 명시자 명단**.
4. §1 핵심 지표 "엔노이아 활용 명시" 행:
   - 값 = "누적 N% (n/total)" 형식 (n = 누적 명단 크기, total = participants.length)
   - 메모 = "W2 X명 + 본 주차 신규 Y명 = 누적 N명" 같이 변동 명시
   - 비율은 W2 대비 절대 감소하지 않는다 (누적이므로).
5. §0 요약과 §6 패턴 관찰에도 누적 비율 사용.

이전 주차 데이터가 없으면 본 주차 단독 카운트.

[엄격 규칙]
- metrics 의 모든 카운트와 미제출자 명단은 반드시 그대로 사용. participants[].submission 본문으로 임의 변형 금지.
- §2 표 행 수 = participants.length 와 정확히 일치 (보통 21).
- 모든 섹션(§0~§6) 빠짐없이 출력. 중간 잘리지 말 것.
- 한국어 보고서 어투("~한다", "~로 나타났다").
- 마지막 줄: _본 페이지는 {scrumDate} 스크럼 결과 기반 1회성 분석입니다._
- 마크다운만 사용. HTML 태그 X. JSON·코드 블록으로 감싸지 말 것.
- "다음과 같습니다", "이상입니다" 같은 메타 멘트 금지.`;
}

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

  // 1. ennoia 분석 요청 — 봇이 정확히 계산한 metrics 를 같이 전달.
  //    ennoia 가 본문 분석으로 카운트를 임의 변형하지 못하도록 명시적 사실 제공.
  const submitted = input.participants.filter((p) => p.submission !== null).length;
  const total = input.participants.length;
  const submittedNames = input.participants
    .filter((p) => p.submission !== null)
    .map((p) => p.name);
  const missedNames = input.participants
    .filter((p) => p.submission === null)
    .map((p) => p.name);
  const submissionRate =
    total > 0 ? `${Math.round((submitted / total) * 1000) / 10}%` : "0%";

  // 이전 주차 리포트 본문을 Confluence 에서 fetch → previousReports 로 전달.
  // 누적 분석(엔노이아 활용 명시자 누적, L0-L4 단계 변동, 패턴 변화 등) 가능.
  const previousReports: Array<{
    pageId: string;
    title: string;
    bodyStorage: string;
  }> = [];
  if (e.CONFLUENCE_PREVIOUS_REPORT_IDS) {
    const ids = e.CONFLUENCE_PREVIOUS_REPORT_IDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const pid of ids) {
      try {
        const p = await getPageBody(pid);
        previousReports.push({ pageId: p.id, title: p.title, bodyStorage: p.body });
      } catch (err) {
        console.error(`[weekly-report] previous page ${pid} fetch failed (continuing):`, err);
      }
    }
  }

  const userPayload = JSON.stringify({
    weekNumber: input.weekNumber,
    scrumDate: input.scrumDate,
    // ⚠️ 분석 시 다음 metrics 를 그대로 사용. participants[].submission 본문 분석으로
    //    임의로 카운트·미제출 판단 변형 금지.
    metrics: {
      submitted,
      total,
      missed: total - submitted,
      submissionRate,
      submittedNames,
      missedNames,
    },
    participants: input.participants,
    // 이전 주차 리포트 (있을 때만). 누적 분석·비교용 reference.
    previousReports,
  });

  let ennoiaText: string;
  let ennoiaRaw: unknown;
  try {
    const res = await runGeminiAgent({
      systemMessage: buildAnalystSystemMessage(),
      userText: userPayload,
      maxOutputTokens: 32768,
      temperature: 0.3,
    });
    ennoiaText = res.text;
    ennoiaRaw = res.raw;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordAuditLog({
      jobName: "A4",
      status: "error",
      errorMessage: `gemini: ${msg}`,
      payload: { weekNumber: input.weekNumber, stage: "gemini" },
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
    // ennoia usage(token 사용량) 도 같이 기록 — 응답 잘림 디버깅용
    const ennoiaUsage =
      typeof ennoiaRaw === "object" && ennoiaRaw !== null
        ? (ennoiaRaw as Record<string, unknown>).usage
        : null;
    await recordAuditLog({
      jobName: "A4",
      status: "success",
      payload: {
        weekNumber: input.weekNumber,
        stage: "confluence",
        pageId: page.id,
        url,
        ennoiaUsage,
        ennoiaTextLength: ennoiaText.length,
        previousReportsCount: previousReports.length,
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
