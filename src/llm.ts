import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function callAgent<T>(
  agentName: string,
  system: string,
  user: string,
  schema: (x: unknown) => T
): Promise<T> {
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const msg = await client.messages.create({
        model: "claude-haiku-4-5", // workspace "Code Crunch" only has Haiku capacity; Sonnet is rate-limited to 0
        max_tokens: 4000,
        system: system + "\nRespond with ONLY valid JSON. No markdown fences, no preamble.",
        messages: [
          {
            role: "user",
            content:
              user + (lastErr ? `\n\nYour previous output failed: ${lastErr}. Return valid JSON only.` : ""),
          },
        ],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .replace(/```json|```/g, "")
        .trim();
      return schema(JSON.parse(text)); // zod .parse throws on bad shape
    } catch (e: any) {
      lastErr = e.message;
      console.warn(`  ⚠️ [${agentName}] attempt ${attempt + 1} failed: ${e.message.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, 1000 * 3 ** attempt));
    }
  }
  throw new Error(`${agentName} failed after 3 attempts: ${lastErr}`);
}
