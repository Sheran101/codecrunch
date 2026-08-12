# GUIDANCE.md — Build the MVP in ~3 Hours

Time-boxed plan. If a step runs over, cut from the "nice-to-have" notes, never from the pipeline.

| Block | Time | What |
|---|---|---|
| 0 | 15 min | Setup: repo, deps, Discord bot, `.env` |
| 1 | 20 min | DB + config + Claude client |
| 2 | 30 min | Discord: poll + notify |
| 3 | 45 min | Agents (all five) |
| 4 | 30 min | Orchestrator + scheduler |
| 5 | 20 min | PPTX renderer |
| 6 | 20 min | End-to-end test + demo prep |

---

## Block 0 — Project Setup (15 min)

### 0.1 Discord prep (do this FIRST — it has waiting time)

1. Create a Discord server (or use a test one). Create channels `#codecrunch` and `#codecrunch-ops`.
2. [discord.com/developers](https://discord.com/developers) → New Application → Bot → copy **token**.
3. Bot settings: enable **Message Content Intent** and **Server Members Intent**.
4. OAuth2 → URL Generator → scopes `bot`, permissions: Send Messages, Embed Links, Attach Files, Add Reactions, Read Message History. Invite the bot to your server.
5. Discord app → Settings → Advanced → **Developer Mode ON**. Right-click both channels → Copy Channel ID. Right-click the supervisor's name → Copy User ID.

### 0.2 Repo

```bash
mkdir codecrunch-organizer && cd codecrunch-organizer
npm init -y
npm i discord.js @anthropic-ai/sdk better-sqlite3 node-cron pptxgenjs zod dotenv
npm i -D typescript tsx @types/node @types/better-sqlite3
npx tsc --init --target es2022 --module nodenext --moduleResolution nodenext --outDir dist --strict
```

`.env`:

```env
DISCORD_TOKEN=...
ANTHROPIC_API_KEY=...
POLL_CHANNEL_ID=...
OPS_CHANNEL_ID=...
SUPERVISOR_USER_ID=...
POLL_WINDOW_MS=30000      # 30s for demo; 4h in real life
RUN_NOW=false
```

### 0.3 Repository structure

```
src/
├── index.ts            # entry: boot bot, start scheduler
├── config.ts           # env loading + validation
├── db.ts               # SQLite setup + queries
├── discord.ts          # poll + notify functions
├── llm.ts              # Claude call helper w/ retries + JSON parsing
├── orchestrator.ts     # the pipeline + state machine
├── agents/
│   ├── participant.ts
│   ├── idea.ts
│   ├── product.ts
│   ├── presentation.ts
│   └── reviewer.ts
└── pptx.ts             # JSON slides → .pptx renderer
artifacts/              # gitignored output
state.db                # gitignored
```

---

## Block 1 — DB, Config, LLM Client (20 min)

### 1.1 `db.ts`

```typescript
import Database from "better-sqlite3";
export const db = new Database("state.db");

db.exec(`
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, run_date TEXT UNIQUE, status TEXT,
  topic TEXT, participant_count INTEGER,
  data TEXT,  -- JSON blob: spec, slides, review notes
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS participants (
  run_id INTEGER, discord_user_id TEXT, username TEXT
);`);

export function getOrCreateRun(date: string) { /* INSERT OR IGNORE, then SELECT */ }
export function setStatus(runId: number, status: string, patch?: object) { /* UPDATE + merge data JSON */ }
export function pastTopics(): string[] {
  return db.prepare("SELECT topic FROM runs WHERE topic IS NOT NULL").all().map((r: any) => r.topic);
}
```

Hackathon shortcut: one `data` TEXT column holding a JSON blob per run beats designing five tables. Don't feel bad about it.

### 1.2 `llm.ts` — the single most important helper

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

export async function callAgent<T>(system: string, user: string, schema: (x: unknown) => T): Promise<T> {
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 4000,
        system: system + "\nRespond with ONLY valid JSON. No markdown fences, no preamble.",
        messages: [{ role: "user", content: user + (lastErr ? `\n\nYour previous output failed: ${lastErr}. Return valid JSON only.` : "") }],
      });
      const text = (msg.content[0] as any).text.replace(/```json|```/g, "").trim();
      return schema(JSON.parse(text));   // zod .parse throws on bad shape
    } catch (e: any) {
      lastErr = e.message;
      await new Promise(r => setTimeout(r, 1000 * 3 ** attempt));
    }
  }
  throw new Error(`Agent failed after 3 attempts: ${lastErr}`);
}
```

Retries, backoff, JSON repair, and schema validation in ~25 lines. Every agent goes through this.

---

## Block 2 — Discord (30 min)

`discord.ts`:

```typescript
import { Client, GatewayIntentBits, TextChannel, AttachmentBuilder } from "discord.js";
import { config } from "./config.js";

export const client = new Client({ intents: [
  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.MessageContent,
]});

export async function runPoll(): Promise<{ userId: string; username: string }[]> {
  const ch = await client.channels.fetch(config.pollChannelId) as TextChannel;
  const msg = await ch.send("🍩 **CodeCrunch tomorrow (Wednesday)!** React ✅ if you're joining.");
  await msg.react("✅");

  await new Promise(r => setTimeout(r, config.pollWindowMs));

  const fresh = await ch.messages.fetch(msg.id);          // refetch to get final reactions
  const reaction = fresh.reactions.cache.get("✅");
  const users = reaction ? await reaction.users.fetch() : new Map();
  return [...users.values()].filter(u => !u.bot).map(u => ({ userId: u.id, username: u.username }));
}

export async function notifySupervisor(text: string, files: string[] = []) {
  const ch = await client.channels.fetch(config.opsChannelId) as TextChannel;
  await ch.send({
    content: `<@${config.supervisorUserId}> ${text}`,
    files: files.map(f => new AttachmentBuilder(f)),
  });
}
```

Gotcha that will eat 15 minutes if you don't know it: **refetch the message** after the wait — the cached reaction counts on the original message object can be stale.

---

## Block 3 — The Five Agents (45 min)

All agents follow one pattern: zod schema + system prompt + `callAgent`. Write the first one carefully, copy-paste the rest.

### 3.1 Participant Agent (`agents/participant.ts`)

Not an LLM agent — it's the `runPoll()` wrapper that saves participants to the DB. Done in Block 2. ✅

### 3.2 Idea Agent

```typescript
import { z } from "zod";
import { callAgent } from "../llm.js";

const IdeaOut = z.object({
  topic: z.string(), tagline: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]), whyFun: z.string(),
});

export async function ideaAgent(count: number, pastTopics: string[]) {
  return callAgent(
    `You are the Idea Agent for CodeCrunch, a weekly 2-3 hour internal hackathon for software engineers.
     Pick ONE fresh, fun, buildable-in-one-evening coding challenge topic.
     Rules: never repeat past topics; scale ambition to headcount (fewer people = smaller scope);
     it must be demoable at the end of the session.`,
    `Participant count: ${count}. Past topics (DO NOT repeat): ${JSON.stringify(pastTopics)}.
     Output JSON: { "topic": "", "tagline": "", "difficulty": "easy|medium|hard", "whyFun": "" }`,
    IdeaOut.parse
  );
}
```

### 3.3 Product Agent

Schema: `{ problemStatement, requirements: string[], acceptanceCriteria: string[], stretchGoals: string[] }`. System prompt key lines: *"Acceptance criteria must be objectively testable in Given/When/Then form. Requirements must be completable by a small team in 2–3 hours. 3–6 requirements, 5–8 ACs."*

### 3.4 Presentation Agent

Outputs **slide content JSON only** — rendering is deterministic code (Block 5):

```typescript
const SlidesOut = z.object({
  slides: z.array(z.object({
    title: z.string(),
    bullets: z.array(z.string()).max(6),
    speakerNotes: z.string(),
  })).min(5).max(7),
});
```

System prompt: *"Create 5–7 kickoff slides: 1) title+tagline, 2) the problem, 3) requirements, 4) acceptance criteria, 5) rules & timing, 6) go build. Max 6 bullets per slide, max 12 words per bullet."*

### 3.5 Reviewer Agent

```typescript
const ReviewOut = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
});
```

System prompt: *"You review CodeCrunch materials. Reject ONLY for: unclear problem statement, untestable acceptance criteria, scope impossible in one evening, or slide bullets over 12 words. Be strict but not pedantic."* Input: the spec + slides JSON.

The loop lives in the orchestrator: if `!approved`, re-run the Presentation Agent with `issues` appended to its prompt. **Max 2 loops**, then force-approve and carry the issues into the supervisor message.

---

## Block 4 — Orchestrator + Scheduler (30 min)

`orchestrator.ts` — a straight line with checkpoints:

```typescript
export async function runPipeline() {
  const today = new Date().toISOString().slice(0, 10);
  const run = getOrCreateRun(today);
  if (run.status === "DONE") return console.log("Already done today");

  try {
    // Each stage: skip if already past it (crash-resume), else do it + checkpoint
    if (before(run, "COLLECTED")) {
      const people = await runPoll();
      savePeople(run.id, people);
      setStatus(run.id, "COLLECTED", { count: people.length });
    }
    if (before(run, "TOPIC_SELECTED")) {
      const idea = await ideaAgent(run.participant_count, pastTopics());
      setStatus(run.id, "TOPIC_SELECTED", { idea });
    }
    if (before(run, "SPEC_READY")) {
      const spec = await productAgent(getData(run.id).idea);
      setStatus(run.id, "SPEC_READY", { spec });
    }
    if (before(run, "REVIEWED")) {
      let slides = await presentationAgent(getData(run.id).spec);
      let review = { approved: false, issues: [] as string[] };
      for (let i = 0; i < 2; i++) {
        review = await reviewerAgent(getData(run.id).spec, slides);
        if (review.approved) break;
        slides = await presentationAgent(getData(run.id).spec, review.issues);
      }
      setStatus(run.id, "REVIEWED", { slides, review });
    }
    // Artifacts + notify
    const dir = writeArtifacts(today, getData(run.id));   // PRD.md, slides.pptx, run.json
    setStatus(run.id, "DONE");
    const d = getData(run.id);
    await notifySupervisor(
      `✅ **CodeCrunch is ready for tomorrow!**\n**Topic:** ${d.idea.topic}\n**Participants:** ${d.count}` +
      (d.review.issues.length ? `\n⚠️ Shipped with review notes: ${d.review.issues.join("; ")}` : ""),
      [`${dir}/slides.pptx`, `${dir}/PRD.md`]
    );
  } catch (e: any) {
    setStatus(run.id, "FAILED", { error: e.message });
    await notifySupervisor(`❌ CodeCrunch prep FAILED at stage **${run.status}**: ${e.message}. Manual fallback needed.`);
  }
}
```

`index.ts`:

```typescript
import cron from "node-cron";
client.once("ready", () => {
  console.log("Bot online");
  if (process.env.RUN_NOW === "true") runPipeline();
  cron.schedule("0 9 * * 2", runPipeline);   // Tuesday 09:00
});
client.login(config.discordToken);
```

---

## Block 5 — PPTX Renderer (20 min)

`pptx.ts` — deterministic JSON → deck:

```typescript
import pptxgen from "pptxgenjs";

export async function renderPptx(slides: Slide[], outPath: string) {
  const pres = new pptxgen();
  pres.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pres.layout = "WIDE";

  slides.forEach((s, i) => {
    const slide = pres.addSlide();
    slide.background = { color: i === 0 ? "1a1a2e" : "FFFFFF" };
    slide.addText(s.title, {
      x: 0.6, y: 0.4, w: 12, h: 1, fontSize: i === 0 ? 40 : 30,
      bold: true, color: i === 0 ? "FFFFFF" : "1a1a2e",
    });
    if (s.bullets.length) slide.addText(
      s.bullets.map(b => ({ text: b, options: { bullet: true, breakLine: true } })),
      { x: 0.8, y: 1.8, w: 11.5, h: 5, fontSize: 20, color: i === 0 ? "FFFFFF" : "333333" }
    );
    slide.addNotes(s.speakerNotes);
  });
  await pres.writeFile({ fileName: outPath });
}
```

Also write `PRD.md` (template-literal the spec into markdown) and `run.json` (dump the run's `data` blob) into the same folder. Three artifacts, ~15 lines each.

---

## Block 6 — Testing + Full Run + Demo Prep (20 min)

### 6.1 Test bottom-up, fast

```bash
# 1. Agents in isolation (no Discord needed) — a scratch script:
npx tsx -e "import('./src/agents/idea.js').then(m => m.ideaAgent(5, ['Snake game']).then(console.log))"

# 2. PPTX renderer with hardcoded slides JSON — open the file, confirm it's not broken

# 3. Full pipeline, demo mode:
RUN_NOW=true POLL_WINDOW_MS=30000 npx tsx src/index.ts
```

React ✅ from a couple of accounts (or teammates' phones) during the 30s window. Watch it flow through to the supervisor ping.

### 6.2 Test the failure path too (judges love this)

Temporarily set a wrong `ANTHROPIC_API_KEY`, run again, and confirm the supervisor gets the ❌ failure message naming the stage. Fix the key back.

### 6.3 Running the real Tuesday → Wednesday workflow

- Set `POLL_WINDOW_MS=14400000` (4h), `RUN_NOW=false`.
- Keep the process running (laptop awake, or `pm2 start`/a cheap VM if you have 10 spare minutes).
- Tuesday 09:00: poll fires → 13:00: window closes → ~13:03: supervisor has topic + deck. Wednesday: CodeCrunch runs off the generated materials.

### 6.4 Demo script (3 minutes)

1. **10s** — "CodeCrunch happens every Wednesday. Someone burns an hour every Tuesday organizing it. We made it organize itself."
2. **Show the Discord server**, empty channels. Run `RUN_NOW=true npm start`.
3. Poll appears → **audience reacts ✅ live** (this is your moment — get judges to react).
4. Narrate the terminal while agents run: poll → idea → spec → slides → review. (~60–90s; if you're nervous about dead air, `console.log` each stage with emojis.)
5. Supervisor ping lands with **PPTX attached — open it live in Discord's preview.**
6. **10s** — "Zero human actions from trigger to ready. State is checkpointed in SQLite, failures notify the supervisor, topics never repeat." Done.

**Backup plan:** record a screen capture of one successful run before the demo. Live demos are a contact sport.

### Nice-to-haves ONLY if time remains

- `❌` reaction handling + "maybe" option
- Topic includes a code-name (Idea Agent generates it — free flavor)
- A `/status` slash command showing the current run's stage
