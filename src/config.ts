import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ Missing required env var: ${name} (check your .env)`);
    process.exit(1);
  }
  return v;
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  pollChannelId: required("POLL_CHANNEL_ID"),
  opsChannelId: required("OPS_CHANNEL_ID"),
  supervisorUserId: required("SUPERVISOR_USER_ID"),
  pollWindowMs: Number(process.env.POLL_WINDOW_MS ?? 30000),
  runNow: process.env.RUN_NOW === "true",
  webPort: Number(process.env.WEB_PORT ?? 3000),
  defaultLocation: process.env.EVENT_LOCATION ?? "BISTEC office — main hall",
  defaultTime: process.env.EVENT_TIME ?? "Wednesday 6:00 PM",
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${process.env.WEB_PORT ?? 3000}`,
};
