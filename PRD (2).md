# PRD.md — Autonomous CodeCrunch Organizer

## 1. Problem Statement

CodeCrunch runs every Wednesday, but it doesn't organize itself. Every week, a human has to remember it's Tuesday, ping people on Discord, chase RSVPs, invent a topic that isn't a repeat, write up the problem statement and acceptance criteria, build slides, sanity-check everything, and tell the supervisor it's ready. That's 1–2 hours of repetitive coordination work weekly, it depends entirely on one person remembering to do it, and when that person is on leave or busy, CodeCrunch either doesn't happen or happens badly (vague topic, no slides, confusion at kickoff).

## 2. Product Vision

**CodeCrunch prepares itself.** Every Tuesday morning, an autonomous agent pipeline polls participants on Discord, picks a fresh topic sized to the turnout, writes the full problem spec, generates a polished slide deck, reviews its own work, and hands the supervisor a ready-to-run event — with humans doing nothing except reacting ✅ and clicking "start" on Wednesday.

## 3. Goals

1. **Zero-touch preparation** — no human action required between Tuesday 09:00 and the supervisor notification.
2. **Fresh, feasible topics** — never repeat a past topic; always solvable in one CodeCrunch session.
3. **Complete artifacts** — every run produces a problem statement, requirements, testable acceptance criteria, and a PPTX.
4. **Reliable notification** — the supervisor always hears from the system, on success or failure.
5. **Buildable in a hackathon** — MVP working end-to-end in ~3 hours.

**Non-goals (v1):** scoring submissions, managing teams, calendar invites, multi-server support, running the actual event.

## 4. Users

| User | Role | What they get |
|---|---|---|
| **Supervisor** | Owns CodeCrunch | A Discord message every Tuesday: topic, headcount, attached PPTX + PRD. Approves by doing nothing |
| **Participants** | Engineers who join | One low-friction poll (react ✅), a clear brief on Wednesday |
| **Operator** (hackathon team) | Runs the system | One process to start, one `.env` to configure, logs + `run.json` when things go wrong |

## 5. User Stories

- **US-1** — As a supervisor, I want CodeCrunch fully prepared by Tuesday evening without asking anyone, so I only review instead of organize.
- **US-2** — As a participant, I want to RSVP with a single reaction, so joining takes two seconds.
- **US-3** — As a participant, I want a topic that's new and doable in one session, so the event stays fun instead of frustrating.
- **US-4** — As a supervisor, I want the problem statement and acceptance criteria in writing, so there are no "what are we actually building?" debates on Wednesday.
- **US-5** — As a supervisor, I want a kickoff slide deck attached to the notification, so I can present without making slides.
- **US-6** — As a supervisor, I want to be told when preparation fails and at which stage, so I can fall back to manual organizing in time.
- **US-7** — As an operator, I want the system to resume from where it crashed, so a mid-run failure doesn't mean re-polling everyone.

## 6. Functional Requirements

| ID | Requirement |
|---|---|
| FR-1 | System triggers automatically every Tuesday at 09:00 via cron; a manual `RUN_NOW` trigger exists for demo/testing |
| FR-2 | System posts a participation poll to a configured Discord channel and collects ✅ reactions for a configurable window |
| FR-3 | System stores participant list and count in the database per run |
| FR-4 | Idea Agent generates a topic, checking past topics in the DB to avoid repeats, adjusting scope to headcount |
| FR-5 | Product Agent produces problem statement, functional requirements, and ≥5 testable acceptance criteria for the topic |
| FR-6 | Presentation Agent generates a 5–7 slide PPTX from the spec using a fixed visual template |
| FR-7 | Reviewer Agent evaluates spec + slides for clarity, feasibility, and AC testability; triggers regeneration on failure (max 2 loops) |
| FR-8 | All artifacts (PRD.md, slides.pptx, run.json) are stored under `artifacts/<date>/` and recorded in the DB |
| FR-9 | System notifies the supervisor on Discord with topic, headcount, review status, and attached artifacts |
| FR-10 | On any unrecoverable failure, system notifies the supervisor with the failed stage and reason |
| FR-11 | Each pipeline stage checkpoints its status to the DB; a restarted process resumes from the last checkpoint |

## 7. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | Full pipeline (excluding the RSVP wait window) completes in < 5 minutes |
| NFR-2 | LLM calls retry 3× with backoff; malformed JSON triggers a corrective re-prompt |
| NFR-3 | Runs on a single machine with Node.js 22; no external infra beyond Discord + Claude API |
| NFR-4 | Secrets (bot token, API key, channel/user IDs) live in `.env`, never in code |
| NFR-5 | Every agent call's input/output is logged to `run.json` for debuggability |
| NFR-6 | Poll wait window configurable from 30 seconds (demo) to hours (production) |

## 8. Acceptance Criteria

- **AC-1** — Given it is Tuesday 09:00 (or `RUN_NOW=true`), when the process is running, then a poll appears in `#codecrunch` within 60 seconds.
- **AC-2** — Given 3 users react ✅ within the window, when the window closes, then the DB shows a run with `participant_count = 3` and those 3 usernames.
- **AC-3** — Given past topics exist in the DB, when the Idea Agent runs, then the new topic string does not match any stored topic.
- **AC-4** — Given a selected topic, when the Product Agent runs, then the output contains a problem statement, ≥3 requirements, and ≥5 acceptance criteria, each phrased testably ("Given/When/Then" or equivalent).
- **AC-5** — Given a completed spec, when the Presentation Agent runs, then a valid `.pptx` with 5–7 slides exists in the artifacts folder and opens in PowerPoint.
- **AC-6** — Given the Reviewer rejects the slides once, when the loop runs, then regeneration occurs at most 2 times before force-approval with logged warnings.
- **AC-7** — Given the pipeline completes, when notification is sent, then the supervisor is mentioned in `#codecrunch-ops` with the PPTX and PRD.md attached.
- **AC-8** — Given the Claude API is unreachable at the Idea stage, when retries are exhausted, then the run is marked `FAILED` and the supervisor receives a message naming the Idea stage.
- **AC-9** — Given the process is killed after `SPEC_READY`, when it restarts, then it resumes at slide generation without re-polling participants.
- **AC-10** — Given zero participants react, when the window closes, then the pipeline still completes and the supervisor message includes a low-turnout warning.

## 9. MVP Scope (the 3-hour build)

**In:**
- Single Node.js process, cron + `RUN_NOW` trigger
- Discord poll with reaction collection (short demo window)
- All 5 agents calling Claude with JSON-schema outputs
- SQLite state + checkpointing
- PPTX via pptxgenjs (fixed template)
- One review loop
- Supervisor notification with attachments
- Success and failure paths

**Out (say "roadmap" in the demo):**
- Rich RSVP (maybe/late options), reminders to non-responders
- Topic voting by participants
- Web dashboard
- Team formation, submission scoring
- Multi-event / multi-server support

## 10. Success Metrics

| Metric | Target |
|---|---|
| Human actions between trigger and supervisor notification | **0** |
| Weekly organizer time saved | ~1–2 hours → ~2 minutes (review only) |
| Runs completing without manual intervention | ≥ 90% |
| Topic repeats | 0 |
| Supervisor notified (success OR failure) | 100% of runs |
| Pipeline runtime (excl. RSVP window) | < 5 min |
| **Hackathon metric:** end-to-end demo, live, no edits | Poll → PPTX in Discord in < 3 minutes |
