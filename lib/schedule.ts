/**
 * 9주 프로그램 캘린더 + 오프라인 / 슬랙 주차 판별.
 *
 * 3기 일정 (PROGRAM_START_DATE = 2026-05-11 월요일):
 *   주차  수요일 공유 방식
 *   W1   킥오프 (반나절 핸즈온, 채널 안내만 발송 — 스크럼 잡 비활성)
 *   W2   슬랙 스크럼  (5/20 수)
 *   W3   오프라인     (5/27 수)
 *   W4   슬랙 스크럼  (6/2 화 → 6/3 수, 화요일 공휴일 케이스만 운영매뉴얼 표 기준)
 *   W5   오프라인     (6/10 수)
 *   W6   슬랙 스크럼  (6/17 수)
 *   W7   오프라인     (6/24 수)
 *   W8   슬랙 스크럼  (7/1 수)
 *   W9   오프라인 최종 (7/8 수)
 *
 * 단순화 규칙: W1 = 킥오프(스크럼 X), W2 부터 짝수 W = 슬랙, 홀수 W = 오프라인.
 *   - W2(짝) 슬랙, W3(홀) 오프라인, W4(짝) 슬랙, W5(홀) 오프라인 ... W9(홀) 오프라인. ✓
 */

import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const KST = "Asia/Seoul";

export type WedFormat = "kickoff" | "offline" | "slack";

export interface WeekContext {
  weekNumber: number; // 1..N
  wedFormat: WedFormat;
  isWithinProgram: boolean;
}

export interface ScheduleConfig {
  startDate: string; // YYYY-MM-DD, must be Monday of W1
  totalWeeks: number; // default 9
}

/** 현재 KST 기준 일자에서 프로그램 컨텍스트 계산. */
export function getWeekContext(now: Date, cfg: ScheduleConfig): WeekContext {
  const nowKst = toZonedTime(now, KST);
  const startKst = toZonedTime(parseISO(cfg.startDate), KST);
  const days = differenceInCalendarDays(startOfDay(nowKst), startOfDay(startKst));
  const weekNumber = Math.floor(days / 7) + 1;
  const isWithinProgram = weekNumber >= 1 && weekNumber <= cfg.totalWeeks;
  const wedFormat: WedFormat =
    weekNumber === 1 ? "kickoff" : weekNumber % 2 === 0 ? "slack" : "offline";
  return { weekNumber, wedFormat, isWithinProgram };
}

/** Cron 핸들러용 idempotency 키. ex: '2026-W19-A3' */
export function runSlot(jobName: string, weekNumber: number): string {
  return `W${weekNumber.toString().padStart(2, "0")}-${jobName}`;
}
