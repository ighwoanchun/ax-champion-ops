/**
 * 마무리(종료) 리포트 자동 생성: 종료 설문 응답 시트 → 정량 집계(코드) + 정성 테마(Gemini)
 * → Confluence 페이지 게시.
 *
 * 관리자 수동 트리거 전용 (`POST /api/admin/final-report`). 기수가 끝나고 종료 설문 응답이
 * 어느 정도 쌓인 시점에 운영진이 직접 호출한다 — 응답률을 운영진이 직접 판단할 수 있게 자동
 * 발화(cron)는 두지 않는다.
 *
 * 설문 문항 구성은 기수마다 달라질 수 있으므로, 컬럼 이름을 하드코딩하지 않고 값의 형태로
 * 문항 유형을 추론한다 (`classifyAndAggregate`):
 *   - 응답이 전부 1~5 숫자 → 5점 척도(rating) 문항 → 평균·분포 집계
 *   - 응답을 콤마로 쪼갠 토큰 종류가 적고 각 토큰이 짧음 → 복수선택(choice) 문항 → 항목별 집계
 *   - 그 외 → 주관식(text) 문항 → Gemini가 테마·인용으로 정리
 *
 * 정량 수치는 전부 코드에서 계산해 JSON으로 Gemini에 전달하고, Gemini는 그 수치를 그대로
 * 옮겨 쓰기만 하도록 강제한다 (weekly-report.ts와 동일한 원칙 — LLM이 카운트를 임의로 바꾸지 않게).
 *
 * 대표 사례·프로그램 소개 같은 서사 섹션은 포함하지 않는다. 그 부분은 운영진이 수치 위에
 * 직접 큐레이션해서 얹는 영역으로 남겨둔다.
 */

import { env } from "./env";
import { runGeminiAgent } from "./gemini";
import {
  absoluteWebUrl,
  createConfluencePage,
  getPageBody,
  markdownToStorage,
  updateConfluencePage,
} from "./confluence";
import { readSurveyResponses } from "./sheets";
import { recordAuditLog } from "./db";

const TIMESTAMP_HEADER_PATTERN = /타임스탬프|timestamp/i;

export type AggregatedColumn =
  | {
      type: "rating";
      question: string;
      responseCount: number;
      average: number;
      distribution: Record<string, number>; // "1"~"5" → 응답 수
    }
  | {
      type: "choice";
      question: string;
      responseCount: number;
      counts: Array<{ option: string; count: number; pct: number }>;
    }
  | {
      type: "text";
      question: string;
      responseCount: number;
      responses: string[];
    };

/** 한 문항(컬럼)의 응답 값 배열을 보고 문항 유형을 추론해 집계한다. */
function classifyAndAggregate(question: string, values: string[]): AggregatedColumn {
  const nonEmpty = values.map((v) => v.trim()).filter(Boolean);
  const responseCount = nonEmpty.length;

  // 5점 척도: 응답이 전부 1~5 숫자 하나뿐일 때.
  if (responseCount > 0 && nonEmpty.every((v) => /^[1-5]$/.test(v))) {
    const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    let sum = 0;
    for (const v of nonEmpty) {
      distribution[v] += 1;
      sum += Number(v);
    }
    return {
      type: "rating",
      question,
      responseCount,
      average: Math.round((sum / responseCount) * 100) / 100,
      distribution,
    };
  }

  // 복수선택 후보: 콤마로 쪼갠 토큰 종류가 적고(≤15), 응답당 평균 토큰 수가 적고(≤6),
  // 각 토큰이 짧고 문장형 어미로 끝나지 않으며(선택지 라벨일 가능성), 같은 토큰이 여러
  // 응답자에게서 반복 등장할 때(공유 선택지라면 당연히 겹쳐야 함 — 안 겹치면 사실 주관식).
  const SENTENCE_ENDING = /(습니다|니다|해요|어요|예요|이에요|입니다|음|[.?!])$/;
  const tokenized = nonEmpty.map((v) => v.split(",").map((t) => t.trim()).filter(Boolean));
  const allTokens = tokenized.flat();
  const distinctTokens = new Set(allTokens);
  const avgTokensPerResponse = tokenized.length ? allTokens.length / tokenized.length : 0;
  const tokenCounts = new Map<string, number>();
  for (const t of allTokens) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1);
  const repeatedTokenShare =
    allTokens.length > 0
      ? allTokens.filter((t) => (tokenCounts.get(t) ?? 0) >= 2).length / allTokens.length
      : 0;
  const looksLikeChoice =
    responseCount > 0 &&
    distinctTokens.size > 0 &&
    distinctTokens.size <= 15 &&
    avgTokensPerResponse <= 6 &&
    repeatedTokenShare >= 0.5 &&
    [...distinctTokens].every((t) => t.length <= 40 && !SENTENCE_ENDING.test(t));

  if (looksLikeChoice) {
    const tally = new Map<string, number>();
    for (const tokens of tokenized) {
      for (const t of tokens) tally.set(t, (tally.get(t) ?? 0) + 1);
    }
    const counts = [...tally.entries()]
      .map(([option, count]) => ({
        option,
        count,
        pct: Math.round((count / responseCount) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
    return { type: "choice", question, responseCount, counts };
  }

  return { type: "text", question, responseCount, responses: nonEmpty };
}

export interface AggregatedSurvey {
  responseCount: number;
  columns: AggregatedColumn[];
}

/** 헤더 행 + 데이터 행 → 문항별 집계. 타임스탬프 컬럼은 제외. */
export function aggregateSurveyResponses(headers: string[], rows: string[][]): AggregatedSurvey {
  const columns: AggregatedColumn[] = [];
  let responseCount = 0;
  headers.forEach((question, colIdx) => {
    if (!question || TIMESTAMP_HEADER_PATTERN.test(question)) return;
    const values = rows.map((r) => r[colIdx] ?? "");
    const agg = classifyAndAggregate(question, values);
    responseCount = Math.max(responseCount, agg.responseCount);
    columns.push(agg);
  });
  return { responseCount, columns };
}

function buildAnalystSystemMessage(): string {
  return `당신은 원티드랩 사내 AI 부트캠프 "AX 챔피언 프로그램"의 마무리(종료) 리포트 분석가입니다.

기수가 끝나면 봇이 종료 설문 응답을 문항 유형별로 집계한 JSON을 전달합니다.
당신의 출력은 그대로 Confluence 페이지의 본문으로 게시됩니다.

[입력 형식]
{
  "cohortLabel": "4기" 같은 기수 라벨,
  "totalParticipants": 정수 (전체 참가자 수),
  "survey": {
    "responseCount": 정수 (설문 응답 인원),
    "columns": [
      { "type": "rating", "question": 문항, "responseCount", "average", "distribution": {"1":n,...,"5":n} } |
      { "type": "choice", "question": 문항, "responseCount", "counts": [{"option","count","pct"}, ...] } |
      { "type": "text", "question": 문항, "responseCount", "responses": ["원문 응답", ...] }
    ]
  },
  "previousReports": [ { "pageId", "title", "bodyStorage" } ]  // 있을 때만
}

[출력 형식 — 마크다운, 아래 섹션 모두 빠짐없이 작성]

## 0. 요약
2-3줄 narrative. 응답률(survey.responseCount/totalParticipants) · rating 문항 평균 중 대표 1~2개 ·
전체적으로 어떤 인상인지 사실 기반으로 요약.

## 1. 응답 개요
| 항목 | 값 |
행: 전체 참가자 / 응답 인원 / 응답률(%, 소수 1자리)

## 2. 정량 결과
survey.columns 중 type이 "rating"인 문항마다 소제목(문항 원문) + 표:
| 지표 | 평균 | 5점 | 4점 | 3점 | 2점 | 1점 |
행은 반드시 1개, distribution 값을 그대로 사용 (응답 수, 임의 재계산 금지).

survey.columns 중 type이 "choice"인 문항마다 소제목(문항 원문) + 표:
| 항목 | 응답 수 | 비율 |
counts 배열 순서(이미 내림차순) 그대로, 상위 항목부터. pct 값 그대로 사용.

## 3. 정성 피드백
survey.columns 중 type이 "text"인 문항마다 소제목(문항 원문).
응답들(responses)을 읽고 반복되는 주제 3-5개로 묶어 각 주제마다:
- 주제 한 줄 요약
- 대표 인용 1-2개 (원문 그대로, 따옴표로 인용. 각색·요약 표현으로 바꿔치기 금지)
응답이 5건 미만인 문항은 주제 묶기 없이 전체 인용만 나열.

## 4. 이전 기수 대비 비교
previousReports 가 있으면: 이전 리포트의 §2 표에서 같은(또는 가장 유사한) 문항의 평균을 찾아
"직전 기수 X → 본 기수 Y (Δ +/-)" 형태로 rating 문항 위주 비교.
previousReports 가 없으면 이 섹션 자체를 생략.

## 5. 시사점
관찰된 정량·정성 결과에서 자연스럽게 도출되는 시사점 2-4개. 새로운 주장·수치를 지어내지 말고
위 섹션에 이미 나온 사실만 근거로 삼는다.

[엄격 규칙]
- survey.columns 의 모든 수치(average, distribution, counts, pct)는 반드시 그대로 사용. 재계산·반올림 임의 변경 금지.
- 응답 원문(quotes)은 존재하지 않는 응답을 지어내지 않는다. responses 배열에 있는 문장만 인용.
- 대표 사례·프로그램 소개·"3기 무엇이 달랐나" 같은 서사 섹션은 쓰지 않는다. 이 리포트는 설문 결과 분석에 한정한다.
- 한국어 보고서 어투("~한다", "~로 나타났다").
- 마크다운만 사용. HTML 태그 X. JSON·코드 블록으로 감싸지 말 것.
- "다음과 같습니다", "이상입니다" 같은 메타 멘트 금지.

[톤 — AI 슬롭 회피, 중요]
사람이 직접 쓴 듯한 담백한 사내 보고서로 작성한다.
- 이모지는 쓰지 않는다.
- 감탄부호(!) 쓰지 않는다. 굵은 글씨(**)는 표의 핵심 수치 등 꼭 필요한 곳에만, 남발 금지.
- 과장·상투적 평가어 자제: "뚜렷한 성장", "괄목할", "약진" 같은 표현 대신 사실과 수치로 담백하게 기술한다.
- 영어 직역투, 미사여구, 자기 언급("본 분석에서는") 자제.`;
}

export interface GenerateFinalReportInput {
  cohortLabel: string; // 예: "4기"
  totalParticipants: number;
  /** 지정하면 새 페이지 생성 대신 해당 페이지를 덮어씀 (잘못 생성된 리포트 정정용). */
  existingPageId?: string;
}

export interface GenerateFinalReportResult {
  pageId: string;
  url: string;
  responseCount: number;
}

/**
 * 종료 설문 응답 집계 + Gemini 분석 + Confluence 페이지 생성.
 * 필수 환경변수 미주입 시 undefined 반환 (호출부에서 명시적으로 에러 처리하도록 throw 대신 안내 로그만).
 */
export async function generateAndPublishFinalReport(
  input: GenerateFinalReportInput,
): Promise<GenerateFinalReportResult | undefined> {
  const e = env();
  const ready =
    e.SURVEY_SHEET_ID &&
    e.GEMINI_API_KEY &&
    e.ATLASSIAN_API_TOKEN &&
    e.ATLASSIAN_EMAIL &&
    e.ATLASSIAN_CLOUD_ID &&
    e.CONFLUENCE_PARENT_PAGE_ID;
  if (!ready) {
    console.log(
      "[final-report] SURVEY_SHEET_ID/gemini/atlassian env not fully configured; skipping",
    );
    return undefined;
  }

  const { headers, rows } = await readSurveyResponses();
  const survey = aggregateSurveyResponses(headers, rows);

  const previousReports: Array<{ pageId: string; title: string; bodyStorage: string }> = [];
  if (e.CONFLUENCE_PREVIOUS_FINAL_REPORT_IDS) {
    const ids = e.CONFLUENCE_PREVIOUS_FINAL_REPORT_IDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const pid of ids) {
      try {
        const p = await getPageBody(pid);
        previousReports.push({ pageId: p.id, title: p.title, bodyStorage: p.body });
      } catch (err) {
        console.error(`[final-report] previous page ${pid} fetch failed (continuing):`, err);
      }
    }
  }

  const userPayload = JSON.stringify({
    cohortLabel: input.cohortLabel,
    totalParticipants: input.totalParticipants,
    survey,
    previousReports,
  });

  let analysisText: string;
  let analysisRaw: unknown;
  try {
    const res = await runGeminiAgent({
      systemMessage: buildAnalystSystemMessage(),
      userText: userPayload,
      maxOutputTokens: 32768,
      temperature: 0.3,
    });
    analysisText = res.text;
    analysisRaw = res.raw;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordAuditLog({
      jobName: "FINAL_REPORT",
      status: "error",
      errorMessage: `gemini: ${msg}`,
      payload: { cohortLabel: input.cohortLabel, stage: "gemini" },
    });
    throw err;
  }

  const storageBody = markdownToStorage(analysisText);
  const title = `${input.cohortLabel} 마무리 리포트 (종료 설문 기준)`;
  try {
    const page = input.existingPageId
      ? await updateConfluencePage({
          pageId: input.existingPageId,
          title,
          body: storageBody,
          representation: "storage",
        })
      : await createConfluencePage({
          parentId: e.CONFLUENCE_PARENT_PAGE_ID!,
          title,
          body: storageBody,
          representation: "storage",
        });
    const url = absoluteWebUrl(page.webui);
    const usage =
      typeof analysisRaw === "object" && analysisRaw !== null
        ? (analysisRaw as Record<string, unknown>).usage
        : null;
    await recordAuditLog({
      jobName: "FINAL_REPORT",
      status: "success",
      payload: {
        cohortLabel: input.cohortLabel,
        pageId: page.id,
        url,
        usage,
        surveyResponseCount: survey.responseCount,
        previousReportsCount: previousReports.length,
      },
    });
    return { pageId: page.id, url, responseCount: survey.responseCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordAuditLog({
      jobName: "FINAL_REPORT",
      status: "error",
      errorMessage: `confluence: ${msg}`,
      payload: { cohortLabel: input.cohortLabel, stage: "confluence" },
    });
    throw err;
  }
}
