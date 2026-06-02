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

import { format as formatDate, subDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { ScheduleFormat, WeeklyScheduleRow } from "./sheets";

const KST = "Asia/Seoul";

export type WedFormat = ScheduleFormat;

/** KST 기준 YYYY-MM-DD 추출 */
export function ymdKst(d: Date): string {
  return formatDate(toZonedTime(d, KST), "yyyy-MM-dd");
}

/**
 * 오늘(KST) 발화 대상 announce 행 찾기.
 * announce_date == 오늘 인 행 반환. 없으면 undefined.
 */
export function findAnnounceForToday(
  now: Date,
  schedule: WeeklyScheduleRow[],
): WeeklyScheduleRow | undefined {
  const today = ymdKst(now);
  return schedule.find((s) => s.announceDate === today && s.format !== "skip");
}

/**
 * 오늘(KST) scrum_date 인 행 찾기.
 * scrum_date == 오늘 인 행 반환. 없으면 undefined.
 */
export function findScrumForToday(
  now: Date,
  schedule: WeeklyScheduleRow[],
): WeeklyScheduleRow | undefined {
  const today = ymdKst(now);
  return schedule.find((s) => s.scrumDate === today && s.format !== "skip");
}

/**
 * 어제(KST)가 scrum_date 인 행 찾기. A4(익일 마감 요약) 용도.
 */
export function findFinalizationDay(
  now: Date,
  schedule: WeeklyScheduleRow[],
): WeeklyScheduleRow | undefined {
  const yesterdayKst = subDays(toZonedTime(now, KST), 1);
  const yesterday = formatDate(yesterdayKst, "yyyy-MM-dd");
  return schedule.find((s) => s.scrumDate === yesterday && s.format !== "skip");
}

/** Cron 핸들러용 idempotency 키. ex: 'W04-A3' */
export function runSlot(jobName: string, weekNumber: number): string {
  return `W${weekNumber.toString().padStart(2, "0")}-${jobName}`;
}
