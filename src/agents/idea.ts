import { z } from "zod";
import { callAgent } from "../llm.js";

const IdeaOut = z.object({
  topic: z.string(),
  tagline: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  whyFun: z.string(),
});
export type Idea = z.infer<typeof IdeaOut>;

export async function ideaAgent(count: number, pastTopics: string[]): Promise<Idea> {
  return callAgent(
    "Idea Agent",
    `You are the Idea Agent for CodeCrunch, a weekly 2-3 hour internal hackathon for software engineers.
Pick ONE fresh, fun, buildable-in-one-evening coding challenge topic.
Rules: the topic must come from a COMPLETELY DIFFERENT domain than every past topic —
first identify the domains of the past topics, then deliberately pick an unrelated one;
scale ambition to headcount (fewer people = smaller scope);
it must be demoable at the end of the session.`,
    `Participant count: ${count}. Past topics (DO NOT repeat): ${JSON.stringify(pastTopics)}.
Output JSON: { "topic": "", "tagline": "", "difficulty": "easy|medium|hard", "whyFun": "" }`,
    IdeaOut.parse
  );
}
