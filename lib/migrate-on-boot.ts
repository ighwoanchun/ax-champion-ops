/**
 * 컨테이너 부팅 시 1회 마이그레이션 자동 실행.
 * instrumentation.ts 에서 호출.
 *
 * 안전성:
 *  - 모든 마이그레이션은 `CREATE TABLE IF NOT EXISTS` 등 idempotent
 *  - 실행 결과는 `cron_runs` 가 아닌 자체 `schema_migrations` 테이블로 추적
 *  - 실패 시 throw → 컨테이너 부팅 실패 → backyard 가 재시작 (장애 가시성 확보)
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

const TRACK_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export async function migrateOnBoot(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] DATABASE_URL not set — skipping (boot will continue, cron jobs will fail at runtime).");
    return;
  }

  const dir = join(process.cwd(), "db", "migrations");
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  } catch (err) {
    console.warn("[migrate] no migrations directory found:", err);
    return;
  }

  if (files.length === 0) {
    console.log("[migrate] no migration files.");
    return;
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query(TRACK_TABLE);

    const applied = await pool.query<{ filename: string }>(
      `SELECT filename FROM schema_migrations`,
    );
    const appliedSet = new Set(applied.rows.map((r) => r.filename));

    let appliedCount = 0;
    for (const f of files) {
      if (appliedSet.has(f)) continue;
      const sql = await readFile(join(dir, f), "utf-8");
      console.log(`[migrate] applying ${f}...`);
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1)`,
          [f],
        );
        await pool.query("COMMIT");
        appliedCount++;
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
    }

    if (appliedCount > 0) {
      console.log(`[migrate] applied ${appliedCount} new migration(s).`);
    } else {
      console.log("[migrate] schema up to date.");
    }
  } finally {
    await pool.end();
  }
}
