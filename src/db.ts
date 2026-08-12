import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// Ensure the directory exists — on a mounted volume the dir may be empty/new.
const dbDir = path.dirname(config.dbPath);
if (dbDir && dbDir !== ".") fs.mkdirSync(dbDir, { recursive: true });

export const db = new Database(config.dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, run_date TEXT UNIQUE, status TEXT,
  topic TEXT, participant_count INTEGER,
  data TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS participants (
  run_id INTEGER, discord_user_id TEXT, username TEXT
);
CREATE TABLE IF NOT EXISTS ui_rsvps (
  poll_date TEXT, name TEXT, created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(poll_date, name)
);`);

export type Run = {
  id: number;
  run_date: string;
  status: string;
  topic: string | null;
  participant_count: number | null;
  data: string | null;
};

// Pipeline state machine, in order. FAILED can happen from any state.
export const STAGES = ["STARTED", "COLLECTED", "TOPIC_SELECTED", "SPEC_READY", "REVIEWED", "DONE"] as const;

export function stageRank(status: string): number {
  return STAGES.indexOf(status as (typeof STAGES)[number]);
}

export function getOrCreateRun(date: string): Run {
  db.prepare("INSERT OR IGNORE INTO runs (run_date, status, data) VALUES (?, 'STARTED', '{}')").run(date);
  return db.prepare("SELECT * FROM runs WHERE run_date = ?").get(date) as Run;
}

export function getRun(id: number): Run {
  return db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as Run;
}

export function setStatus(runId: number, status: string, patch: Record<string, unknown> = {}) {
  const run = getRun(runId);
  const data = { ...JSON.parse(run.data ?? "{}"), ...patch };
  db.prepare(
    "UPDATE runs SET status = ?, data = ?, topic = COALESCE(?, topic), participant_count = COALESCE(?, participant_count), updated_at = datetime('now') WHERE id = ?"
  ).run(
    status,
    JSON.stringify(data),
    (patch as any).idea?.topic ?? null,
    (patch as any).count ?? null,
    runId
  );
}

export function getData(runId: number): any {
  return JSON.parse(getRun(runId).data ?? "{}");
}

export function savePeople(runId: number, people: { userId: string; username: string }[]) {
  const insert = db.prepare("INSERT INTO participants (run_id, discord_user_id, username) VALUES (?, ?, ?)");
  for (const p of people) insert.run(runId, p.userId, p.username);
}

export function appendEvent(runId: number, text: string) {
  const run = getRun(runId);
  const data = JSON.parse(run.data ?? "{}");
  data.events = [...(data.events ?? []), { at: new Date().toISOString(), text }];
  db.prepare("UPDATE runs SET data = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(data), runId);
}

export function addRsvp(date: string, name: string) {
  db.prepare("INSERT OR IGNORE INTO ui_rsvps (poll_date, name) VALUES (?, ?)").run(date, name);
}

export function getRsvps(date: string): string[] {
  return (db.prepare("SELECT name FROM ui_rsvps WHERE poll_date = ? ORDER BY created_at").all(date) as { name: string }[]).map(
    (r) => r.name
  );
}

export function pastTopics(): string[] {
  return (db.prepare("SELECT topic FROM runs WHERE topic IS NOT NULL").all() as { topic: string }[]).map(
    (r) => r.topic
  );
}
