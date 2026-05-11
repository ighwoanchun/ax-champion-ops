/**
 * Next.js instrumentation hook.
 * 서버 부팅 시 1회 실행 — 마이그레이션 + node-cron 등록.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 1. DB 마이그레이션 자동 실행 (idempotent)
  try {
    const { migrateOnBoot } = await import("./lib/migrate-on-boot");
    await migrateOnBoot();
  } catch (err) {
    console.error("[instrumentation] migration failed — aborting boot:", err);
    throw err;
  }

  // 2. node-cron 잡 등록
  const { registerCronJobs } = await import("./server/cron/register");
  await registerCronJobs();
}
