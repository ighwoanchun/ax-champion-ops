/**
 * Cron 잡을 즉시 수동 발화. 디버깅·dry-run 검증용.
 *
 * 사용:
 *   npm run cron:fire -- A1
 *   npm run cron:fire -- A3
 *   npm run cron:fire -- A4
 */

async function main() {
  const job = process.argv[2];
  if (!job) {
    console.error("usage: cron:fire <A1|A3|A4>");
    process.exit(1);
  }

  switch (job.toUpperCase()) {
    case "A1": {
      const { runA1 } = await import("../server/cron/a1-monday-announce");
      await runA1();
      break;
    }
    case "A3": {
      const { runA3 } = await import("../server/cron/a3-wednesday-channel-remind");
      await runA3();
      break;
    }
    case "A4": {
      const { runA4 } = await import("../server/cron/a4-wednesday-finalize");
      await runA4();
      break;
    }
    default:
      console.error(`unknown job: ${job}`);
      process.exit(1);
  }
  console.log("[fire-cron] done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[fire-cron] failed:", err);
  process.exit(1);
});
