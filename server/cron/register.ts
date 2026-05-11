/**
 * node-cron 잡 등록 진입점.
 * instrumentation.ts 가 서버 부팅 시 1회 호출.
 *
 * 정책:
 *  - 기본은 CRON_AUTO_ENABLED=false → 등록 SKIP. 수동 트리거(/api/admin/cron/...)로만 발화.
 *  - true 로 명시 전환 시 KST 기준 자동 발화.
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

  console.log("[cron] CRON_AUTO_ENABLED=true → registering MVP jobs (A1, A3, A4)...");

  const cron = (await import("node-cron")).default;
  const { runA1 } = await import("./a1-monday-announce");
  const { runA3 } = await import("./a3-wednesday-channel-remind");
  const { runA4 } = await import("./a4-wednesday-finalize");

  // A1 — 월요일 09:00 KST 채널 안내
  cron.schedule(
    "0 9 * * 1",
    () => {
      runA1().catch((err) => console.error("[cron][A1] error:", err));
    },
    { timezone: TZ },
  );

  // A3 — 수요일 15:00 KST 미제출자 채널 멘션
  cron.schedule(
    "0 15 * * 3",
    () => {
      runA3().catch((err) => console.error("[cron][A3] error:", err));
    },
    { timezone: TZ },
  );

  // A4 — 수요일 18:00 KST 마감 + 트래킹
  cron.schedule(
    "0 18 * * 3",
    () => {
      runA4().catch((err) => console.error("[cron][A4] error:", err));
    },
    { timezone: TZ },
  );

  console.log("[cron] registration complete: A1, A3, A4");
}
