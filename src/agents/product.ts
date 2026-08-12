import { z } from "zod";
import { callAgent } from "../llm.js";
import type { Idea } from "./idea.js";

const SpecOut = z.object({
  problemStatement: z.string(),
  requirements: z.array(z.string()).min(3).max(6),
  acceptanceCriteria: z.array(z.string()).min(5).max(8),
  stretchGoals: z.array(z.string()),
});
export type Spec = z.infer<typeof SpecOut>;

export async function productAgent(idea: Idea): Promise<Spec> {
  return callAgent(
    "Product Agent",
    `You are the Product Agent for CodeCrunch, a weekly 2-3 hour internal hackathon.
You turn a challenge topic into a buildable spec.
Acceptance criteria must be objectively testable in Given/When/Then form.
Requirements must be completable by a small team in 2-3 hours. 3-6 requirements, 5-8 ACs.`,
    `Topic: ${idea.topic} — ${idea.tagline} (difficulty: ${idea.difficulty})
Output JSON: { "problemStatement": "", "requirements": [""], "acceptanceCriteria": [""], "stretchGoals": [""] }`,
    SpecOut.parse
  );
}
