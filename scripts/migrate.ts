/**
 * DB 마이그레이션 실행기.
 *   db/migrations/*.sql 을 알파벳 순으로 모두 실행.
 *   각 파일은 idempotent (CREATE TABLE IF NOT EXISTS 등) 가정.
 *
 * 사용:
 *   DATABASE_URL=postgres://... npm run db:migrate
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const dir = join(process.cwd(), "db", "migrations");
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("[migrate] no migrations found.");
    return;
  }

  const pool = new Pool({ connectionString: url });
  try {
    for (const f of files) {
      const sql = await readFile(join(dir, f), "utf-8");
      console.log(`[migrate] applying ${f}...`);
      await pool.query(sql);
    }
    console.log(`[migrate] done. applied ${files.length} migrations.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
