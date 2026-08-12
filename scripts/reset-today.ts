import { db } from "../src/db.js";

const today = new Date().toISOString().slice(0, 10);
db.prepare("DELETE FROM runs WHERE run_date = ?").run(today);
db.prepare("DELETE FROM ui_rsvps WHERE poll_date = ?").run(today);
console.log(`cleared run + rsvps for ${today}`);
