import http from "node:http";
import { config } from "./config.js";
import { db, addRsvp, getRsvps } from "./db.js";
import { runPipeline } from "./orchestrator.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function status() {
  const run = db.prepare("SELECT * FROM runs WHERE run_date = ?").get(today()) as any;
  const data = run ? JSON.parse(run.data ?? "{}") : {};
  return {
    date: today(),
    stage: run?.status ?? "NOT_STARTED",
    topic: run?.topic ?? null,
    tagline: data.idea?.tagline ?? null,
    count: run?.participant_count ?? null,
    location: data.location ?? config.defaultLocation,
    time: data.time ?? config.defaultTime,
    people: (data.people ?? []).map((p: any) => p.username),
    teams: data.teams ?? [],
    events: data.events ?? [],
    rsvps: getRsvps(today()),
  };
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CodeCrunch Dashboard</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:#1a1a2e; color:#eee;
         font-family:system-ui, sans-serif; padding:2rem 1rem; }
  .wrap { max-width:1000px; margin:0 auto; }
  h1 { margin:0; font-size:1.8rem; } .sub { color:#9ab; margin:.25rem 0 1.5rem; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1rem; }
  .card { background:#16213e; border-radius:14px; padding:1.25rem 1.5rem; box-shadow:0 4px 24px rgba(0,0,0,.4); }
  .card h2 { margin:0 0 .75rem; font-size:1rem; color:#9ab; text-transform:uppercase; letter-spacing:.05em; }
  .big { font-size:2.4rem; font-weight:800; }
  .stage-badge { display:inline-block; padding:.3rem .8rem; border-radius:999px; background:#0f3460; font-weight:700; }
  .stage-badge.done { background:#1b5e20; } .stage-badge.failed { background:#7f1d1d; }
  input, select { width:100%; padding:.65rem .9rem; border-radius:10px; border:1px solid #345;
          background:#0f1626; color:#eee; font-size:.95rem; margin-bottom:.6rem; }
  button { width:100%; padding:.75rem; border-radius:10px; border:0; background:#e94560; color:#fff;
           font-size:1rem; font-weight:700; cursor:pointer; }
  button:hover { filter:brightness(1.1); }
  ul { padding-left:1.2rem; margin:.25rem 0; color:#cde; } li { margin:.2rem 0; }
  .team { background:#0f1626; border-radius:10px; padding:.6rem .9rem; margin:.4rem 0; }
  .team b { color:#e94560; }
  .log { max-height:300px; overflow-y:auto; font-size:.88rem; }
  .log div { padding:.35rem 0; border-bottom:1px solid #223; color:#cde; }
  .log time { color:#789; margin-right:.5rem; font-variant-numeric:tabular-nums; }
  .ok { color:#7f7; min-height:1.2rem; }
  .full { grid-column: 1 / -1; }
</style>
</head>
<body>
<div class="wrap">
  <h1>🍩 CodeCrunch Dashboard</h1>
  <p class="sub" id="meta">Loading…</p>

  <div class="grid">
    <div class="card"><h2 id="counthead">Participants</h2><div class="big" id="count">–</div><ul id="people"></ul></div>
    <div class="card"><h2>Stage</h2><div style="margin-bottom:.75rem"><span class="stage-badge" id="stage">–</span></div>
      <div id="topic" style="font-size:1.1rem;font-weight:700"></div><div id="tagline" style="color:#9ab"></div></div>
    <div class="card">
      <h2>RSVP — I'm in!</h2>
      <form id="f"><input id="name" placeholder="Your name" required maxlength="40"><button type="submit">React ✅</button></form>
      <p id="msg" class="ok"></p>
    </div>
    <div class="card">
      <h2>Organizer — kick it off</h2>
      <input id="loc" placeholder="Location (e.g. Main hall)">
      <input id="time" placeholder="Time (e.g. Wednesday 6 PM)">
      <button id="run" style="background:#0f3460">▶ Announce &amp; run pipeline</button>
      <p id="runmsg" class="ok"></p>
    </div>
    <div class="card"><h2>Teams (auto-formed)</h2><div id="teams">No teams yet</div></div>
    <div class="card full"><h2>Activity — what the bot has done</h2><div class="log" id="log">Nothing yet</div></div>
  </div>
</div>
<script>
const $ = (id) => document.getElementById(id);
$('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('name').value.trim();
  if (!name) return;
  const r = await fetch('/rsvp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
  $('msg').textContent = r.ok ? '✅ You\\'re in, ' + name + '!' : '❌ Something went wrong';
  refresh();
});
$('run').addEventListener('click', async () => {
  const body = JSON.stringify({ location: $('loc').value.trim(), time: $('time').value.trim() });
  await fetch('/run', { method:'POST', headers:{'Content-Type':'application/json'}, body });
  $('runmsg').textContent = '🚀 Pipeline started — announcement heading to Discord';
  refresh();
});
const esc = (s) => String(s).replace(/</g, '&lt;');
async function refresh() {
  const s = await (await fetch('/api/status')).json();
  $('meta').textContent = s.date + ' · 📍 ' + s.location + ' · 🕕 ' + s.time;
  const collected = s.count !== null;
  $('counthead').textContent = collected ? 'Participants (final count)' : 'RSVPs so far (poll still open)';
  $('count').textContent = s.count ?? s.rsvps.length;
  const names = s.people.length ? s.people : s.rsvps;
  $('people').innerHTML = names.map(n => '<li>' + esc(n) + '</li>').join('');
  const badge = $('stage');
  badge.textContent = s.stage;
  badge.className = 'stage-badge' + (s.stage === 'DONE' ? ' done' : s.stage === 'FAILED' ? ' failed' : '');
  $('topic').textContent = s.topic ?? '';
  $('tagline').textContent = s.tagline ?? '';
  $('teams').innerHTML = s.teams.length
    ? s.teams.map((t, i) => '<div class="team"><b>Team ' + (i+1) + ':</b> ' + t.map(esc).join(', ') + '</div>').join('')
    : 'No teams yet';
  $('log').innerHTML = s.events.length
    ? s.events.slice().reverse().map(e =>
        '<div><time>' + new Date(e.at).toLocaleTimeString() + '</time>' + esc(e.text) + '</div>').join('')
    : 'Nothing yet';
}
refresh(); setInterval(refresh, 2500);
</script>
</body>
</html>`;

export function startWebServer() {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/healthz") {
        // No DB touch — pure liveness signal for the platform's health check.
        res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      } else if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(status()));
      } else if (req.method === "POST" && req.url === "/rsvp") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const name = String(JSON.parse(body || "{}").name ?? "").trim().slice(0, 40);
        if (!name) {
          res.writeHead(400).end("name required");
          return;
        }
        addRsvp(today(), name);
        console.log(`🙋 Web RSVP: ${name}`);
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
      } else if (req.method === "POST" && req.url === "/run") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const parsed = JSON.parse(body || "{}");
        runPipeline({
          location: String(parsed.location ?? "").trim() || undefined,
          time: String(parsed.time ?? "").trim() || undefined,
        }); // fire and forget; guarded against double-runs internally
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404).end("not found");
      }
    } catch (e: any) {
      res.writeHead(500).end(e.message);
    }
  });
  server.listen(config.webPort, () => console.log(`🌐 Dashboard at ${config.publicUrl}`));
}
