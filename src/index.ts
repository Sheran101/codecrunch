import cron from "node-cron";
import { client } from "./discord.js";
import { config } from "./config.js";
import { runPipeline } from "./orchestrator.js";
import { startWebServer } from "./web.js";

client.once("clientReady", () => {
  console.log(`🤖 Bot online as ${client.user?.tag}`);
  startWebServer();
  if (config.runNow) {
    console.log("🚀 RUN_NOW=true — firing pipeline immediately");
    runPipeline();
  }
  cron.schedule("0 9 * * 2", () => runPipeline()); // every Tuesday 09:00 — automatic
  console.log("⏰ Scheduled: every Tuesday 09:00");
});

client.login(config.discordToken);
