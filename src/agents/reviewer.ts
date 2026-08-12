import { z } from "zod";
import { callAgent } from "../llm.js";
import type { Spec } from "./product.js";
import type { Slides } from "./presentation.js";

const ReviewOut = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
});
export type Review = z.infer<typeof ReviewOut>;

export async function reviewerAgent(spec: Spec, slides: Slides): Promise<Review> {
  return callAgent(
    "Reviewer Agent",
    `You review CodeCrunch materials. Reject ONLY for: unclear problem statement,
untestable acceptance criteria, scope impossible in one evening, or slide bullets over 12 words.
Be strict but not pedantic.`,
    `Spec: ${JSON.stringify(spec)}
Slides: ${JSON.stringify(slides)}
Output JSON: { "approved": true|false, "issues": [""] }`,
    ReviewOut.parse
  );
}
