import "dotenv/config";

const REQUIRED = [
  "DISCORD_TOKEN",
  "ANTHROPIC_API_KEY",
  "POLL_CHANNEL_ID",
  "OPS_CHANNEL_ID",
  "SUPERVISOR_USER_ID",
] as const;

/** Env vars that are absent. Empty array === bot can start. */
export const missingEnv: string[] = REQUIRED.filter((n) => !process.env[n]);

const env = (name: string): string => process.env[name] ?? "";

export const config = {
  discordToken: env("DISCORD_TOKEN"),
  anthropicApiKey: env("ANTHROPIC_API_KEY"),
  pollChannelId: env("POLL_CHANNEL_ID"),
  opsChannelId: env("OPS_CHANNEL_ID"),
  supervisorUserId: env("SUPERVISOR_USER_ID"),

  pollWindowMs: Number(process.env.POLL_WINDOW_MS ?? 30000),
  runNow: process.env.RUN_NOW === "true",

  // Hosts inject PORT. WEB_PORT kept for local backwards-compat.
  webPort: Number(process.env.PORT ?? process.env.WEB_PORT ?? 3000),

  // Point these at a mounted volume in production so state survives redeploys.
  dbPath: process.env.DB_PATH ?? "state.db",
  artifactsDir: process.env.ARTIFACTS_DIR ?? "artifacts",

  cronSchedule: process.env.CRON_SCHEDULE ?? "0 9 * * 2",

  defaultLocation: process.env.EVENT_LOCATION ?? "BISTEC office — main hall",
  defaultTime: process.env.EVENT_TIME ?? "Wednesday 6:00 PM",
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? process.env.WEB_PORT ?? 3000}`,
};
