# TEAMS-SWAP.md — Replace Discord with Microsoft Teams

Drop-in replacement for Block 0.1 and Block 2 of GUIDANCE.md. Everything else
(agents, orchestrator, cron, PPTX, SQLite) is unchanged.

**Why this combo:** the old Teams "Incoming Webhook" connector is retired (Dec 2025).
The replacement is a **Workflows webhook** (send-only) + **Microsoft Graph** for
reading reactions. Both are free with the BISTEC M365 tenant — no paid API key.

**Key trick:** run the poll in a **group chat**, not a channel. Reading chat
messages/reactions only needs `Chat.ReadWrite` (delegated, **no admin consent**).
Reading *channel* messages needs admin-consented permissions — don't risk it in a
3-hour window.

---

## Setup (replaces Discord bot setup, ~15 min)

### A. Workflows webhook (supervisor notifications) — 5 min

1. In Teams, go to the channel/chat where the supervisor should be pinged.
2. `⋯` → **Workflows** → **"Post to a channel when a webhook request is received"**
   (or the chat variant) → create.
3. Copy the webhook URL → `.env` as `TEAMS_WEBHOOK_URL`.

### B. Azure app registration (poll + reactions via Graph) — 10 min

1. [portal.azure.com](https://portal.azure.com) → **App registrations** → New →
   name `codecrunch-bot`, single tenant. Copy **Application (client) ID** and
   **Directory (tenant) ID**.
2. **Authentication** → enable **"Allow public client flows"** (needed for device-code login).
3. **API permissions** → Add → Microsoft Graph → **Delegated** → `Chat.ReadWrite`,
   `User.Read`. (No admin consent needed.)
4. Create a **group chat** in Teams with the participants (name it "CodeCrunch").
   Open it in Teams **web** — the chat ID is in the URL
   (`19:...@thread.v2`, URL-decode it) → `.env` as `POLL_CHAT_ID`.

### C. `.env` (replaces Discord vars)

```env
ANTHROPIC_API_KEY=...
TENANT_ID=...
CLIENT_ID=...
POLL_CHAT_ID=19:xxxxxxxx@thread.v2
TEAMS_WEBHOOK_URL=https://prod-xx.westus.logic.azure.com/...
POLL_WINDOW_MS=30000
RUN_NOW=false
```

### D. Deps

```bash
npm r discord.js
npm i @azure/identity
```

---

## `src/teams.ts` (replaces `src/discord.ts`)

```typescript
import { DeviceCodeCredential } from "@azure/identity";

const cred = new DeviceCodeCredential({
  tenantId: process.env.TENANT_ID!,
  clientId: process.env.CLIENT_ID!,
  userPromptCallback: (info) => console.log(info.message), // prints login URL+code once
});

async function graph(path: string, init: RequestInit = {}) {
  const token = (await cred.getToken("https://graph.microsoft.com/.default")).token;
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function runPoll(): Promise<{ userId: string; username: string }[]> {
  const msg = await graph(`/chats/${process.env.POLL_CHAT_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({
      body: { contentType: "html", content: "🍩 <b>CodeCrunch tomorrow (Wednesday)!</b> React 👍 if you're joining." },
    }),
  });

  await new Promise((r) => setTimeout(r, Number(process.env.POLL_WINDOW_MS)));

  // Refetch the message — reactions come back on the chatMessage resource
  const fresh = await graph(`/chats/${process.env.POLL_CHAT_ID}/messages/${msg.id}`);
  return (fresh.reactions ?? []).map((r: any) => ({
    userId: r.user?.user?.id ?? "unknown",
    username: r.user?.user?.displayName ?? r.user?.user?.id ?? "someone",
  }));
}

export async function notifySupervisor(text: string, files: string[] = []) {
  await fetch(process.env.TEAMS_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text, wrap: true, weight: "Bolder" },
            ...files.map((f) => ({ type: "TextBlock", text: `📎 ${f}`, wrap: true })),
          ],
        },
      }],
    }),
  });
}
```

`index.ts` loses the Discord client — no `client.login`, no `ready` event. Just:

```typescript
import cron from "node-cron";
import { runPipeline } from "./orchestrator.js";

if (process.env.RUN_NOW === "true") runPipeline();
cron.schedule("0 9 * * 2", runPipeline); // every Tuesday 09:00, automatic
```

Trigger model (unchanged from PRD FR-1): cron fires itself every Tuesday;
`RUN_NOW=true npm start` fires on demand for demo/testing.

---

## Known trade-offs (say "roadmap" if asked)

- **Webhook can't attach files.** The card lists artifact paths; open `slides.pptx`
  locally during the demo. (Roadmap: upload to OneDrive via Graph + share link.)
- **Device-code login is one interactive step at process start** (open URL, enter
  code). The credential caches the token for the session — fine for a demo.
- **If a reaction's `displayName` comes back null**, show the user ID — don't burn
  time resolving names.
- **Gotcha carried over from GUIDANCE.md:** always REFETCH the poll message after
  the wait window; the original response has no reactions.
