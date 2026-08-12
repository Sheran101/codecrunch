import cron from "node-cron";
import { client } from "./discord.js";
import { config, missingEnv } from "./config.js";
import { runPipeline } from "./orchestrator.js";
import { startWebServer } from "./web.js";

// 1. Dashboard comes up FIRST and unconditionally.
startWebServer();

// 2. Discord + cron are best-effort on top.
if (missingEnv.length > 0) {
  console.error(`⚠️  Missing env vars: ${missingEnv.join(", ")}`);
  console.error("   Dashboard is up, but the Discord bot and pipeline are disabled.");
} else {
  client.once("clientReady", () => {
    console.log(`🤖 Bot online as ${client.user?.tag}`);
    if (config.runNow) {
      console.log("🚀 RUN_NOW=true — firing pipeline immediately");
      runPipeline();
    }
    cron.schedule(config.cronSchedule, () => runPipeline());
    console.log(`⏰ Scheduled: ${config.cronSchedule}`);
  });

  client.login(config.discordToken).catch((e: any) => {
    console.error(`❌ Discord login failed: ${e.message} — dashboard still running`);
  });
}

// 3. Don't let one bad pipeline run kill the whole container.
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("SIGTERM", () => {
  console.log("SIGTERM — shutting down");
  client.destroy().catch(() => {});
  process.exit(0);
});
