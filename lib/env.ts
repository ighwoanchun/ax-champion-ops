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
  // PROGRAM_START_DATE / PROGRAM_WEEKS 는 2026-06-01 이후 weekly_schedule 시트 기반으로 전환되어
  // 핸들러는 더 이상 참조하지 않는다. 호환·메타데이터 용도로만 유지.
  PROGRAM_START_DATE: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .optional(),
  PROGRAM_WEEKS: z
    .string()
    .default("9")
    .transform((v) => parseInt(v, 10))
    .optional(),

  // ── Atlassian / Confluence (P1 주간 리포트 자동 생성) ──
  // 모두 optional. 미주입 시 A4가 Confluence 생성 단계만 silent skip.
  ATLASSIAN_API_TOKEN: z.string().optional(),
  ATLASSIAN_EMAIL: z.string().email().optional(),
  ATLASSIAN_CLOUD_ID: z.string().optional(), // 예: "wantedlab.atlassian.net" 또는 UUID
  CONFLUENCE_PARENT_PAGE_ID: z.string().optional(),

  // ── ennoia (LLM 분석) ──
  // 인증: headers { project, apiKey }. agent 식별: body.hash. messages[].content[] = [{type:'text', text}].
  ENNOIA_API_TOKEN: z.string().optional(),
  ENNOIA_PROJECT_ID: z.string().optional(),
  ENNOIA_AGENT_HASH: z.string().optional(),
  ENNOIA_ENDPOINT_URL: z.string().url().optional(),
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
