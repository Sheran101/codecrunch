import { z } from "zod";
import { callAgent } from "../llm.js";
import type { Spec } from "./product.js";
import type { Idea } from "./idea.js";

const SlidesOut = z.object({
  slides: z
    .array(
      z.object({
        title: z.string(),
        bullets: z.array(z.string()).max(6),
        speakerNotes: z.string(),
      })
    )
    .min(5)
    .max(7),
});
export type Slides = z.infer<typeof SlidesOut>;
export type Slide = Slides["slides"][number];

export async function presentationAgent(idea: Idea, spec: Spec, fixIssues: string[] = []): Promise<Slides> {
  return callAgent(
    "Presentation Agent",
    `You are the Presentation Agent for CodeCrunch kickoff decks.
Create EXACTLY 6 kickoff slides: 1) title+tagline, 2) the problem, 3) requirements,
4) acceptance criteria, 5) rules & timing, 6) go build.
Never more than 7 slides total. Max 6 bullets per slide, max 12 words per bullet.`,
    `Topic: ${idea.topic} — ${idea.tagline}
Spec: ${JSON.stringify(spec)}` +
      (fixIssues.length ? `\n\nA reviewer rejected the previous version. Fix these issues: ${JSON.stringify(fixIssues)}` : "") +
      `\nOutput JSON: { "slides": [{ "title": "", "bullets": [""], "speakerNotes": "" }] }`,
    SlidesOut.parse
  );
}
