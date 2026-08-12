// One-off helper: logs in, lists every server/text-channel the bot can see,
// so we can copy the channel IDs into .env without Discord Developer Mode.
import "dotenv/config";
import { Client, GatewayIntentBits, ChannelType } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  for (const [, guild] of client.guilds.cache) {
    console.log(`\nServer: ${guild.name} (${guild.id})`);
    const channels = await guild.channels.fetch();
    for (const [, ch] of channels) {
      if (ch?.type === ChannelType.GuildText) console.log(`  #${ch.name} -> ${ch.id}`);
    }
    try {
      const owner = await guild.fetchOwner();
      console.log(`  owner: ${owner.user.username} -> ${owner.id}`);
    } catch {}
  }
  client.destroy();
});

client.login(process.env.DISCORD_TOKEN);
