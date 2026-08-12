import {
  Client,
  GatewayIntentBits,
  TextChannel,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventEntityType,
} from "discord.js";
import { config } from "./config.js";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

export async function announcePoll(location: string, time: string): Promise<string> {
  const ch = (await client.channels.fetch(config.pollChannelId)) as TextChannel;
  const date = new Date().toISOString().slice(0, 10);
  let files: AttachmentBuilder[] = [];
  try {
    const { generatePoster } = await import("./poster.js");
    files = [new AttachmentBuilder(await generatePoster(location, time, date))];
  } catch (e: any) {
    console.warn(`   ⚠️ Poster generation failed (announcing without it): ${e.message}`);
  }
  // Discord API rejects poll + attachment in one message — send the poster first, then the poll
  await ch.send({
    content:
      `🍩 **CodeCrunch is happening!**\n` +
      `📍 **Location:** ${location}\n` +
      `🕕 **Time:** ${time}\n` +
      `💡 **Topic:** tech-related — revealed once headcount is in!\n\n` +
      `Vote **Yes** in the poll below (or react ✅) — or RSVP on the web: ${config.publicUrl}`,
    files,
  });
  let msg;
  try {
    msg = await ch.send({
      poll: {
        question: { text: "Are you joining CodeCrunch? 🍩" },
        answers: [
          { text: "Yes, I'm in!", emoji: "✅" },
          { text: "Can't make it", emoji: "❌" },
        ],
        duration: 24,
        allowMultiselect: false,
      },
    });
  } catch (e: any) {
    // Poll unavailable (permissions/API) — fall back to the reaction-only workflow
    console.warn(`   ⚠️ Poll creation failed, falling back to reactions: ${e.message}`);
    msg = await ch.send("👆 React ✅ to **this message** if you're joining!");
  }
  await msg.react("✅");
  return msg.id;
}

// Native Discord scheduled event so CodeCrunch shows up in the server's Events list
export async function createScheduledEvent(location: string, time: string, date: string): Promise<string> {
  const ch = (await client.channels.fetch(config.pollChannelId)) as TextChannel;
  const start = new Date(Date.now() + 24 * 3600 * 1000); // demo default: tomorrow, same time of day
  const end = new Date(start.getTime() + 3 * 3600 * 1000);
  const ev = await ch.guild.scheduledEvents.create({
    name: `🍩 CodeCrunch — ${date}`,
    scheduledStartTime: start,
    scheduledEndTime: end,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location },
    description: `Monthly hackathon night!\n📍 ${location}\n🕕 ${time}\n💡 Topic: tech-related — revealed at kickoff.`,
  });
  return ev.id;
}

export async function postTeams(teams: string[][], topic: string) {
  const ch = (await client.channels.fetch(config.pollChannelId)) as TextChannel;
  await ch.send(
    `👥 **Teams for "${topic}"** — no fuss on the day, you already have your squad:\n` +
      teams.map((t, i) => `**Team ${i + 1}:** ${t.join(", ")}`).join("\n")
  );
}

export async function collectResponders(msgId: string): Promise<{ userId: string; username: string }[]> {
  // Refetch — cached poll/reaction state on the original message object can be stale
  const ch = (await client.channels.fetch(config.pollChannelId)) as TextChannel;
  const fresh = await ch.messages.fetch(msgId);
  const users = new Map<string, string>(); // id -> username (dedupes poll + reaction overlap)

  // Poll "Yes" voters (first answer)
  try {
    const yes = fresh.poll?.answers.first();
    if (yes) {
      const voters = await yes.fetchVoters();
      for (const u of voters.values()) if (!u.bot) users.set(u.id, u.username);
    }
    await fresh.poll?.end().catch(() => {}); // freeze the poll once the window closes
  } catch (e: any) {
    console.warn(`   ⚠️ Poll voter fetch failed (falling back to reactions): ${e.message}`);
  }

  // ✅ reactions (kept as a backup path)
  const reaction = fresh.reactions.cache.get("✅");
  if (reaction) {
    const rUsers = await reaction.users.fetch();
    for (const u of rUsers.values()) if (!u.bot) users.set(u.id, u.username);
  }

  return [...users].map(([userId, username]) => ({ userId, username }));
}

export type EventChannels = { categoryId: string; textId: string; voiceId: string; unresolved: string[] };

// Private text + voice channel for THIS event's participants only —
// people rotate month to month, so each CodeCrunch gets its own scoped space.
export async function createEventChannels(
  date: string,
  participants: { userId: string; username: string }[]
): Promise<EventChannels> {
  const pollCh = (await client.channels.fetch(config.pollChannelId)) as TextChannel;
  const guild = pollCh.guild;

  // Discord reactors carry real IDs; web RSVPs get best-effort name matching (REST search, no privileged intent)
  const memberIds: string[] = [];
  const unresolved: string[] = [];
  for (const p of participants) {
    if (!p.userId.startsWith("web:")) {
      memberIds.push(p.userId);
      continue;
    }
    try {
      const found = await guild.members.search({ query: p.username, limit: 2 });
      const match = [...found.values()].find((m) => !m.user.bot);
      if (match) memberIds.push(match.id);
      else unresolved.push(p.username);
    } catch {
      unresolved.push(p.username);
    }
  }

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: client.user!.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect],
    },
    ...[...new Set(memberIds)].map((id) => ({
      id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
      ],
    })),
  ];

  const category = await guild.channels.create({
    name: `🍩 CodeCrunch ${date}`,
    type: ChannelType.GuildCategory,
    permissionOverwrites,
  });
  const text = await guild.channels.create({
    name: `cc-${date}-chat`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
  });
  const voice = await guild.channels.create({
    name: `CC Voice ${date}`,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites,
  });

  return { categoryId: category.id, textId: text.id, voiceId: voice.id, unresolved };
}

export async function postWelcome(
  textId: string,
  info: { topic: string; tagline: string; location: string; time: string; teams: string[][]; unresolved: string[] }
) {
  const ch = (await client.channels.fetch(textId)) as TextChannel;
  await ch.send(
    `👋 **Welcome to CodeCrunch!**\n` +
      `**Topic:** ${info.topic} — *${info.tagline}*\n` +
      `📍 ${info.location} · 🕕 ${info.time}\n\n` +
      (info.teams.length
        ? `👥 **Teams:**\n${info.teams.map((t, i) => `**Team ${i + 1}:** ${t.join(", ")}`).join("\n")}\n\n`
        : "") +
      `This channel (and the voice channel next door) is just for this event's participants. 🎧` +
      (info.unresolved.length
        ? `\n\n⚠️ Web RSVPs I couldn't match to Discord accounts — organizers, please add them manually: ${info.unresolved.join(", ")}`
        : "")
  );
}

export async function notifySupervisor(text: string, files: string[] = []) {
  const ch = (await client.channels.fetch(config.opsChannelId)) as TextChannel;
  await ch.send({
    content: `<@${config.supervisorUserId}> ${text}`,
    files: files.map((f) => new AttachmentBuilder(f)),
  });
}
