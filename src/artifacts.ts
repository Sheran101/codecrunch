import fs from "node:fs";
import path from "node:path";
import { renderPptx } from "./pptx.js";

import { config } from "./config.js";

export async function writeArtifacts(date: string, data: any): Promise<string> {
  const dir = path.join(config.artifactsDir, date);
  fs.mkdirSync(dir, { recursive: true });

  const { idea, spec, slides, review, count } = data;

  const prd = `# CodeCrunch — ${idea.topic}

> ${idea.tagline} · Difficulty: **${idea.difficulty}** · Participants: **${count}**

## Problem Statement

${spec.problemStatement}

## Requirements

${spec.requirements.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")}

## Acceptance Criteria

${spec.acceptanceCriteria.map((a: string, i: number) => `- **AC-${i + 1}** — ${a}`).join("\n")}

## Stretch Goals

${spec.stretchGoals.map((s: string) => `- ${s}`).join("\n")}

---
*Review: ${review.approved ? "✅ approved" : "⚠️ force-approved"}${review.issues.length ? ` — open notes: ${review.issues.join("; ")}` : ""}*
`;
  fs.writeFileSync(path.join(dir, "PRD.md"), prd);
  fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(data, null, 2));
  await renderPptx(slides.slides, path.join(dir, "slides.pptx"));

  return dir;
}
