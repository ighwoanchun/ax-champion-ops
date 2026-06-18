/**
 * node-cron 잡 등록 진입점.
 * instrumentation.ts 가 서버 부팅 시 1회 호출.
 *
 * 정책:
 *  - 기본은 CRON_AUTO_ENABLED=false → 등록 SKIP. 수동 트리거(/api/admin/cron/...)로만 발화.
 *  - true 로 명시 전환 시 KST 기준 자동 발화.
 *
 * 스케줄 정책 (2026-06-01~ weekly_schedule 시트 기반 전환):
 *  - cron 발화는 매일 09/15/18시 KST 고정.
 *  - 각 핸들러는 시트의 announce_date / scrum_date 와 오늘 KST 일자를 비교해 발화 여부를 결정.
 *  - 즉 시트만 갱신하면 cron 코드 변경 없이 일정 변경 가능 (공휴일 회피 등).
 */

let registered = false;

const TZ = "Asia/Seoul";

export async function registerCronJobs(): Promise<void> {
  if (registered) {
    console.log("[cron] already registered, skipping.");
    return;
  }
  registered = true;

  const enabled = process.env.CRON_AUTO_ENABLED === "true";
  if (!enabled) {
    console.log(
      "[cron] auto-cron DISABLED (CRON_AUTO_ENABLED!=true). Manual trigger only via /api/admin/cron/{A1|A3|A4}.",
    );
    return;
  }

  console.log("[cron] CRON_AUTO_ENABLED=true → registering daily tick jobs...");

  const cron = (await import("node-cron")).default;
  const { runA1 } = await import("./a1-monday-announce");
  const { runA2 } = await import("./a2-scrum-day-morning");
  const { runA3 } = await import("./a3-wednesday-channel-remind");
  const { runA4 } = await import("./a4-wednesday-finalize");

  // A1 — 매일 10:00 KST 발화. announce_date == 오늘 인 경우 한 주 시작 격려 메시지.
  cron.schedule(
    "0 10 * * *",
    () => {
      runA1().catch((err) => console.error("[cron][A1] error:", err));
    },
    { timezone: TZ },
  );

  // A2 — 매일 11:00 KST 발화.
  // scrum_date == 오늘 + format=slack 인 경우 양식 안내 메시지를 채널에 게시.
  cron.schedule(
    "0 11 * * *",
    () => {
      runA2().catch((err) => console.error("[cron][A2] error:", err));
    },
    { timezone: TZ },
  );

  // A3 — 매일 15:00 KST 발화. scrum_date == 오늘 + format=slack 인 경우 중간 현황 게시.
  cron.schedule(
    "0 15 * * *",
    () => {
      runA3().catch((err) => console.error("[cron][A3] error:", err));
    },
    { timezone: TZ },
  );

  // A4 — 매일 10:00 KST 발화 (익일 마감 처리).
  // 어제 == scrum_date + format=slack 인 경우 운영진 DM 으로 마감 요약 발송.
  cron.schedule(
    "0 10 * * *",
    () => {
      runA4().catch((err) => console.error("[cron][A4] error:", err));
    },
    { timezone: TZ },
  );

  console.log(
    "[cron] registration complete: A1@10 (announce), A2@11 (scrum-day form), A3@15 (mid-status), A4@10 (next-day finalize)",
  );
}
