import { z } from "zod";

const envSchema = z.object({
  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-"),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_AX_CHANNEL_ID: z.string().startsWith("C"),
  SLACK_ADMIN_USER_ID: z.string().startsWith("U"),
  SLACK_AI_JUBJUB_CHANNEL_ID: z.string().startsWith("C").optional(),

  GOOGLE_SHEETS_ID: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email(),
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().min(1),

  DATABASE_URL: z.string().url(),

  DRY_RUN: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // 기본 false — 자동 cron 등록 비활성. 수동 트리거(/api/admin/cron/...)만 발화.
  // 검증 완료 후 자동 가동을 원하는 시점에 true 로 전환.
  CRON_AUTO_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // 수동 트리거 endpoint 인증 토큰. 길고 임의의 문자열 권장.
  ADMIN_API_TOKEN: z.string().min(16),

  TZ: z.string().default("Asia/Seoul"),
  PROGRAM_START_DATE: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  PROGRAM_WEEKS: z
    .string()
    .default("9")
    .transform((v) => parseInt(v, 10)),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[env] validation failed:", parsed.error.flatten().fieldErrors);
    throw new Error("Environment validation failed. See logs.");
  }
  cached = parsed.data;
  return cached;
}
