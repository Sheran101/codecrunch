import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

// Renders an event poster PNG (1200x630) with the location/time/date baked in.
// Pure SVG shapes + text — no emoji (renderer font support varies), laptops drawn as vectors.
export async function generatePoster(location: string, time: string, date: string): Promise<string> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const laptop = (x: number, y: number, scale: number, screen: string) => `
    <g transform="translate(${x},${y}) scale(${scale})">
      <rect x="10" y="0" width="120" height="78" rx="6" fill="#0f1626" stroke="#e94560" stroke-width="3"/>
      <rect x="18" y="8" width="104" height="62" rx="3" fill="${screen}"/>
      <text x="70" y="48" font-family="Consolas, monospace" font-size="26" fill="#7fffb0" text-anchor="middle">&lt;/&gt;</text>
      <path d="M0 82 L140 82 L132 96 L8 96 Z" fill="#223" stroke="#e94560" stroke-width="2"/>
    </g>`;

  const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a1a2e"/><stop offset="1" stop-color="#16213e"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="10" fill="#e94560"/>
  <rect x="0" y="620" width="1200" height="10" fill="#e94560"/>

  <!-- donut logo -->
  <circle cx="140" cy="140" r="62" fill="#e94560"/>
  <circle cx="140" cy="140" r="26" fill="#1a1a2e"/>
  <circle cx="112" cy="112" r="6" fill="#ffd166"/><circle cx="168" cy="120" r="6" fill="#7fffb0"/>
  <circle cx="150" cy="170" r="6" fill="#4cc9f0"/><circle cx="115" cy="160" r="6" fill="#fff"/>

  <text x="240" y="125" font-family="Arial, sans-serif" font-size="88" font-weight="900" fill="#ffffff" letter-spacing="2">CODE CRUNCH</text>
  <text x="243" y="175" font-family="Arial, sans-serif" font-size="30" fill="#9ab" letter-spacing="6">MONTHLY HACKATHON NIGHT</text>

  <!-- info panel -->
  <rect x="90" y="250" width="640" height="240" rx="18" fill="#0f1626" stroke="#345" stroke-width="2"/>
  <text x="130" y="315" font-family="Arial, sans-serif" font-size="24" fill="#e94560" font-weight="700">WHERE</text>
  <text x="270" y="315" font-family="Arial, sans-serif" font-size="30" fill="#ffffff">${esc(location)}</text>
  <text x="130" y="380" font-family="Arial, sans-serif" font-size="24" fill="#e94560" font-weight="700">WHEN</text>
  <text x="270" y="380" font-family="Arial, sans-serif" font-size="30" fill="#ffffff">${esc(time)} · ${esc(date)}</text>
  <text x="130" y="445" font-family="Arial, sans-serif" font-size="24" fill="#e94560" font-weight="700">TOPIC</text>
  <text x="270" y="445" font-family="Arial, sans-serif" font-size="30" fill="#ffffff">Tech-related — revealed at kickoff!</text>

  <!-- laptops -->
  ${laptop(790, 300, 1.3, "#16324f")}
  ${laptop(980, 340, 1.0, "#1b3a2f")}
  ${laptop(880, 430, 0.8, "#3a1b32")}

  <!-- CTA -->
  <rect x="90" y="530" width="420" height="60" rx="30" fill="#e94560"/>
  <path d="M125 560 l12 12 l24 -26" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="180" y="570" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#ffffff">REACT TO JOIN</text>
</svg>`;

  const dir = path.join("artifacts", date);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "poster.png");
  await sharp(Buffer.from(svg)).png().toFile(out);
  return out;
}
