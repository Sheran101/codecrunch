import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const c = new Anthropic();
for (const model of ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-sonnet-4-5"]) {
  try {
    const r = await c.messages.create({ model, max_tokens: 20, messages: [{ role: "user", content: "Say OK" }] });
    console.log(model, "-> WORKS:", (r.content[0] as any).text);
  } catch (e: any) {
    console.log(model, "->", String(e.message).slice(0, 140));
  }
}
