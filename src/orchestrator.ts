import {
  getOrCreateRun,
  getRun,
  getData,
  setStatus,
  savePeople,
  pastTopics,
  getRsvps,
  appendEvent,
  stageRank,
  Run,
} from "./db.js";
import {
  announcePoll,
  collectResponders,
  notifySupervisor,
  postTeams,
  createEventChannels,
  postWelcome,
  createScheduledEvent,
} from "./discord.js";
import { config } from "./config.js";
import { ideaAgent } from "./agents/idea.js";
import { productAgent } from "./agents/product.js";
import { presentationAgent } from "./agents/presentation.js";
import { reviewerAgent } from "./agents/reviewer.js";
import { writeArtifacts } from "./artifacts.js";

// Skip a stage if the run has already passed it (crash-resume via DB checkpoint)
function before(run: Run, stage: string): boolean {
  return stageRank(run.status) < stageRank(stage);
}

// Shuffle participants into teams of ~3 (never leave someone alone)
export function makeTeams(names: string[], size = 3): string[][] {
  const shuffled = [...names].sort(() => Math.random() - 0.5);
  const teams: string[][] = [];
  for (let i = 0; i < shuffled.length; i += size) teams.push(shuffled.slice(i, i + size));
  if (teams.length > 1 && teams[teams.length - 1].length === 1) {
    teams[teams.length - 2].push(...teams.pop()!);
  }
  return teams;
}

export type RunOptions = { location?: string; time?: string };

let running = false;

export async function runPipeline(opts: RunOptions = {}) {
  if (running) return console.log("Pipeline already running, skipping");
  running = true;
  const today = new Date().toISOString().slice(0, 10);
  const run = getOrCreateRun(today);
  if (run.status === "DONE") {
    running = false;
    return console.log(`Run for ${today} already DONE`);
  }
  if (run.status === "FAILED") setStatus(run.id, "STARTED"); // retry a failed run from scratch

  const location = opts.location || config.defaultLocation;
  const time = opts.time || config.defaultTime;
  setStatus(run.id, getRun(run.id).status, { location, time });

  try {
    if (before(getRun(run.id), "COLLECTED")) {
      console.log("📊 Stage 1/5: Announce + collect (Discord ✅ + web RSVPs)...");
      const msgId = await announcePoll(location, time);
      appendEvent(run.id, `📢 Announcement + poster + poll sent to Discord (${location}, ${time})`);

      try {
        const eventId = await createScheduledEvent(location, time, today);
        setStatus(run.id, getRun(run.id).status, { scheduledEventId: eventId });
        appendEvent(run.id, `📅 Discord scheduled event created`);
      } catch (e: any) {
        appendEvent(run.id, `⚠️ Could not create scheduled event: ${e.message.slice(0, 80)} (bot needs "Manage Events")`);
        console.warn(`   ⚠️ Scheduled event failed: ${e.message}`);
      }

      console.log(`⏳ Poll open for ${Math.round(config.pollWindowMs / 1000)}s...`);
      await new Promise((r) => setTimeout(r, config.pollWindowMs));

      const discordPeople = await collectResponders(msgId);
      const webPeople = getRsvps(today).map((name) => ({ userId: `web:${name}`, username: name }));
      const seen = new Set<string>();
      const people = [...discordPeople, ...webPeople].filter((p) =>
        seen.has(p.username.toLowerCase()) ? false : (seen.add(p.username.toLowerCase()), true)
      );
      savePeople(run.id, people);
      const teams = makeTeams(people.map((p) => p.username));
      setStatus(run.id, "COLLECTED", { count: people.length, people, teams });
      appendEvent(run.id, `✅ Collected ${people.length} participant(s) (${discordPeople.length} Discord, ${webPeople.length} web)`);
      appendEvent(run.id, `👥 Formed ${teams.length} team(s)`);
      console.log(`   ✅ ${people.length} participant(s) (${discordPeople.length} Discord, ${webPeople.length} web), ${teams.length} team(s)`);
    }

    if (before(getRun(run.id), "TOPIC_SELECTED")) {
      console.log("💡 Stage 2/5: Idea Agent...");
      const count = getData(run.id).count ?? 0;
      const idea = await ideaAgent(count, pastTopics());
      setStatus(run.id, "TOPIC_SELECTED", { idea });
      appendEvent(run.id, `💡 Topic selected: "${idea.topic}"`);
      console.log(`   ✅ Topic: ${idea.topic}`);
    }

    if (before(getRun(run.id), "SPEC_READY")) {
      console.log("📋 Stage 3/5: Product Agent...");
      const spec = await productAgent(getData(run.id).idea);
      setStatus(run.id, "SPEC_READY", { spec });
      appendEvent(run.id, `📋 Spec written (${spec.requirements.length} requirements, ${spec.acceptanceCriteria.length} ACs)`);
      console.log(`   ✅ Spec: ${spec.requirements.length} reqs, ${spec.acceptanceCriteria.length} ACs`);
    }

    if (before(getRun(run.id), "REVIEWED")) {
      console.log("🎨 Stage 4/5: Presentation + Reviewer loop...");
      const { idea, spec } = getData(run.id);
      let slides = await presentationAgent(idea, spec);
      let review = { approved: false, issues: [] as string[] };
      for (let i = 0; i < 2; i++) {
        review = await reviewerAgent(spec, slides);
        if (review.approved) break;
        console.log(`   🔁 Reviewer rejected (loop ${i + 1}/2): ${review.issues.join("; ")}`);
        appendEvent(run.id, `🔁 Reviewer requested changes, regenerating slides`);
        slides = await presentationAgent(idea, spec, review.issues);
      }
      if (!review.approved) console.log("   ⚠️ Force-approving after 2 loops, carrying issues forward");
      setStatus(run.id, "REVIEWED", { slides, review });
      appendEvent(run.id, `🎨 Slides built & reviewed (${slides.slides.length} slides, ${review.approved ? "approved" : "force-approved"})`);
      console.log(`   ✅ ${slides.slides.length} slides, approved: ${review.approved}`);
    }

    console.log("📦 Stage 5/5: Artifacts + notify...");
    const data = getData(run.id);
    // Teams must always derive from the final collected participant list —
    // recompute if missing (e.g. crash-resume from a run checkpointed before teams existed)
    if (!data.teams?.length && data.people?.length) {
      data.teams = makeTeams(data.people.map((p: any) => p.username));
      setStatus(run.id, getRun(run.id).status, { teams: data.teams });
      appendEvent(run.id, `👥 Formed ${data.teams.length} team(s) from ${data.people.length} collected participant(s)`);
    }
    const dir = await writeArtifacts(today, data);
    appendEvent(run.id, `📦 Artifacts written (PRD.md, slides.pptx, run.json)`);

    // Private event channels — only for the people who accepted the invitation
    if (!data.channels && data.count > 0) {
      try {
        const channels = await createEventChannels(today, data.people);
        setStatus(run.id, getRun(run.id).status, { channels });
        data.channels = channels;
        appendEvent(
          run.id,
          `🔒 Private event channels created (chat + voice) for ${data.count} participant(s)` +
            (channels.unresolved.length ? ` — ${channels.unresolved.length} web RSVP(s) need manual add` : "")
        );
        await postWelcome(channels.textId, {
          topic: data.idea.topic,
          tagline: data.idea.tagline,
          location: data.location,
          time: data.time,
          teams: data.teams ?? [],
          unresolved: channels.unresolved,
        });
        appendEvent(run.id, `👋 Welcome message posted in the event channel`);
      } catch (e: any) {
        appendEvent(run.id, `⚠️ Could not create event channels: ${e.message.slice(0, 100)} (bot needs "Manage Channels" permission)`);
        console.warn(`   ⚠️ Channel creation failed: ${e.message}`);
      }
    }

    const teamsText = (data.teams as string[][])?.length
      ? `\n**Teams:**\n${(data.teams as string[][]).map((t, i) => `Team ${i + 1}: ${t.join(", ")}`).join("\n")}`
      : "";
    const channelText = data.channels?.textId ? `\n**Event channels:** <#${data.channels.textId}> + voice 🔒` : "";
    await notifySupervisor(
      `✅ **CodeCrunch is ready!**\n📍 ${data.location} · 🕕 ${data.time}\n**Topic:** ${data.idea.topic} — *${data.idea.tagline}*\n**Participants:** ${data.count}` +
        (data.count === 0 ? "\n⚠️ **Low turnout warning:** zero participants reacted." : "") +
        (data.review.issues.length && !data.review.approved
          ? `\n⚠️ Shipped with review notes: ${data.review.issues.join("; ")}`
          : "") +
        teamsText +
        channelText,
      [`${dir}/slides.pptx`, `${dir}/PRD.md`]
    );
    appendEvent(run.id, `📨 PPTX + PRD sent to supervisor (${data.count} participants reported)`);

    if ((data.teams as string[][])?.length && data.count > 0) {
      await postTeams(data.teams, data.idea.topic);
      appendEvent(run.id, `👥 Teams posted to Discord`);
    }

    setStatus(run.id, "DONE");
    appendEvent(run.id, `🎉 Run complete`);
    console.log(`🎉 DONE — artifacts in ${dir}`);
  } catch (e: any) {
    const failedStage = getRun(run.id).status;
    setStatus(run.id, "FAILED", { error: e.message, failedAfterStage: failedStage });
    appendEvent(run.id, `❌ FAILED after stage ${failedStage}: ${e.message.slice(0, 120)}`);
    console.error(`❌ Pipeline FAILED after stage ${failedStage}: ${e.message}`);
    try {
      await notifySupervisor(
        `❌ **CodeCrunch prep FAILED** at stage **${failedStage}**: ${e.message}\nManual fallback needed.`
      );
      appendEvent(run.id, `📨 Failure notification sent to supervisor`);
    } catch (notifyErr: any) {
      console.error(`   (also failed to notify supervisor: ${notifyErr.message})`);
    }
  } finally {
    running = false;
  }
}
