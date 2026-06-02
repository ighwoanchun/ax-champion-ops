import { google, sheets_v4 } from "googleapis";
import { env } from "./env";

let api: sheets_v4.Sheets | undefined;

export function sheets(): sheets_v4.Sheets {
  if (api) return api;
  const e = env();
  const credsJson = JSON.parse(e.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.JWT({
    email: e.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: credsJson.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  api = google.sheets({ version: "v4", auth });
  return api;
}

export type ParticipantRow = {
  slackUserId: string;
  name: string;
  email: string;
  teamRound1: string;
  teamTypeRound1: string;
  teamRound2: string;
  teamTypeRound2: string;
  status: string; // active / dropped
  droppedAt: string;
  memo: string;
};

const SHEET_PARTICIPANTS = "participants";
const SHEET_ATTENDANCE = "offline_attendance";
const SHEET_REPORT = "weekly_report";
const SHEET_WEEKLY_SCHEDULE = "weekly_schedule";

export type ScheduleFormat = "kickoff" | "slack" | "offline" | "skip";

export type WeeklyScheduleRow = {
  weekNumber: number;
  format: ScheduleFormat;
  announceDate: string; // YYYY-MM-DD (KST). 빈 값이면 그 주차 A1 발화 안 함.
  scrumDate: string;    // YYYY-MM-DD (KST). 빈 값이면 그 주차 A3/A4 발화 안 함.
  notes: string;
};

/**
 * weekly_schedule 탭 전체 조회.
 * 헤더: weekNumber | format | announce_date | scrum_date | notes
 * weekNumber가 숫자가 아닌 행(빈 행 등)은 자동 제외.
 */
export async function listWeeklySchedule(): Promise<WeeklyScheduleRow[]> {
  const e = env();
  const r = await sheets().spreadsheets.values.get({
    spreadsheetId: e.GOOGLE_SHEETS_ID,
    range: `${SHEET_WEEKLY_SCHEDULE}!A2:E`,
  });
  const rows = r.data.values ?? [];
  return rows
    .filter((row) => row[0] && /^\d+$/.test(String(row[0]).trim()))
    .map((row) => {
      const fmtRaw = String(row[1] ?? "").trim().toLowerCase();
      const fmt: ScheduleFormat =
        fmtRaw === "kickoff" || fmtRaw === "slack" ||
        fmtRaw === "offline" || fmtRaw === "skip"
          ? fmtRaw
          : "skip";
      return {
        weekNumber: parseInt(String(row[0]).trim(), 10),
        format: fmt,
        announceDate: String(row[2] ?? "").trim(),
        scrumDate: String(row[3] ?? "").trim(),
        notes: String(row[4] ?? "").trim(),
      };
    });
}

/** participants 탭 전체 조회 (헤더 제외) */
export async function listParticipants(): Promise<ParticipantRow[]> {
  const e = env();
  const r = await sheets().spreadsheets.values.get({
    spreadsheetId: e.GOOGLE_SHEETS_ID,
    range: `${SHEET_PARTICIPANTS}!A2:J`,
  });
  const rows = r.data.values ?? [];
  return rows.map((row) => ({
    slackUserId: row[0] ?? "",
    name: row[1] ?? "",
    email: row[2] ?? "",
    teamRound1: row[3] ?? "",
    teamTypeRound1: row[4] ?? "",
    teamRound2: row[5] ?? "",
    teamTypeRound2: row[6] ?? "",
    status: row[7] ?? "",
    droppedAt: row[8] ?? "",
    memo: row[9] ?? "",
  }));
}

/** participants 탭 전체 덮어쓰기 (sync-participants 스크립트용) */
export async function writeParticipants(rows: ParticipantRow[]): Promise<void> {
  const e = env();
  const values = rows.map((r) => [
    r.slackUserId,
    r.name,
    r.email,
    r.teamRound1,
    r.teamTypeRound1,
    r.teamRound2,
    r.teamTypeRound2,
    r.status,
    r.droppedAt,
    r.memo,
  ]);
  await sheets().spreadsheets.values.update({
    spreadsheetId: e.GOOGLE_SHEETS_ID,
    range: `${SHEET_PARTICIPANTS}!A2`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/** weekly_report 탭에 한 행 추가 (A4 마감 요약 미러링) */
export async function appendWeeklyReport(row: {
  weekNumber: number;
  reportDate: string; // YYYY-MM-DD
  totalActive: number;
  scrumSubmitted: number;
  scrumMissed: number;
  offlineAttended: number;
  dropoutSignalCount: number;
  highlights?: string;
}): Promise<void> {
  const e = env();
  await sheets().spreadsheets.values.append({
    spreadsheetId: e.GOOGLE_SHEETS_ID,
    range: `${SHEET_REPORT}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          row.weekNumber,
          row.reportDate,
          row.totalActive,
          row.scrumSubmitted,
          row.scrumMissed,
          row.offlineAttended,
          row.dropoutSignalCount,
          row.highlights ?? "",
        ],
      ],
    },
  });
}

export const SHEETS = {
  PARTICIPANTS: SHEET_PARTICIPANTS,
  ATTENDANCE: SHEET_ATTENDANCE,
  REPORT: SHEET_REPORT,
};
