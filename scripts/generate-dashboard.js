#!/usr/bin/env node
// Turns analyze.js's JSON output into a self-contained, theme-aware HTML
// dashboard (no external CDN/deps) and optionally opens it in the default
// browser. Charts are hand-drawn inline SVG so the file works fully offline.
//
// Usage:
//   node analyze.js > analysis.json
//   node generate-dashboard.js --input analysis.json --out dashboard.html --open

import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

function parseArgs(argv) {
  const args = { input: null, out: "clarity-dashboard.html", open: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") args.input = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--open") args.open = true;
  }
  return args;
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const METRIC_COLOR = {
  RageClickCount: "#e0555a",
  DeadClickCount: "#d99a3d",
  ScriptErrorCount: "#b34cd1",
  ErrorClickCount: "#b34cd1",
  ExcessiveScroll: "#4c8fd1",
  QuickbackClick: "#4cae7a",
};

function barChart(findings) {
  if (findings.length === 0) return "<p class=\"empty\">No aggregated findings above baseline.</p>";
  const max = Math.max(...findings.map((f) => f.severity));
  const rows = findings.slice(0, 15).map((f) => {
    const widthPct = max > 0 ? (f.severity / max) * 100 : 0;
    const color = METRIC_COLOR[f.metric] ?? "#888";
    const ratioLabel = f.ratioVsBaseline !== null ? `${f.ratioVsBaseline}x baseline` : "no baseline";
    return `
      <div class="bar-row">
        <div class="bar-label">
          <span class="metric-dot" style="background:${color}"></span>
          <strong>${esc(f.metric)}</strong>
          <span class="segment">${esc(f.segment)}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${widthPct}%;background:${color}"></div>
        </div>
        <div class="bar-meta">${esc(f.count)} / ${esc(f.sessions)} sessions · ${esc(ratioLabel)}</div>
      </div>`;
  }).join("\n");
  return `<div class="bars">${rows}</div>`;
}

function sessionFlowSection(sessionFindings) {
  if (!sessionFindings || sessionFindings.length === 0) return "";
  const rows = sessionFindings.slice(0, 20).map((s) => `
    <tr>
      <td>${esc(s.url)}</td>
      <td>${esc(s.sessions)}</td>
      <td class="num rage">${esc(s.rageClicks)}</td>
      <td class="num dead">${esc(s.deadClicks)}</td>
      <td class="num err">${esc(s.errors)}</td>
    </tr>`).join("\n");

  return `
    <section>
      <h2>Per-session event summary</h2>
      <p class="hint">From the optional session/event export — approximates how users move: where rage/dead clicks and errors cluster per page.</p>
      <table>
        <thead><tr><th>URL</th><th>Sessions</th><th>Rage clicks</th><th>Dead clicks</th><th>Errors</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function findingCards(findings) {
  return findings.slice(0, 8).map((f) => {
    const color = METRIC_COLOR[f.metric] ?? "#888";
    return `
      <div class="card" style="border-left-color:${color}">
        <div class="card-title">${esc(f.metric)}</div>
        <div class="card-segment">${esc(f.segment)}</div>
        <div class="card-stat">${esc((f.rate * 100).toFixed(1))}% of sessions${f.ratioVsBaseline ? ` · ${esc(f.ratioVsBaseline)}x baseline` : ""}</div>
      </div>`;
  }).join("\n");
}

function buildHtml(data) {
  const findings = data.aggregatedFindings ?? [];
  const generated = new Date().toISOString();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Clarity UX Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --bg: #f7f7f8; --panel: #ffffff; --text: #1a1a1a; --muted: #6b6b70;
    --border: #e4e4e7;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #121214; --panel: #1c1c1f; --text: #f2f2f3; --muted: #9a9aa0; --border: #2c2c30; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
  header { padding: 24px 32px; border-bottom: 1px solid var(--border); }
  h1 { margin: 0 0 4px; font-size: 1.4rem; }
  .subtitle { color: var(--muted); font-size: 0.85rem; }
  main { padding: 24px 32px; max-width: 1100px; margin: 0 auto; }
  section { margin-bottom: 32px; }
  h2 { font-size: 1.05rem; margin-bottom: 8px; }
  .hint { color: var(--muted); font-size: 0.82rem; margin-top: 0; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-left: 4px solid #888; border-radius: 8px; padding: 12px 14px; }
  .card-title { font-weight: 600; font-size: 0.9rem; }
  .card-segment { color: var(--muted); font-size: 0.78rem; margin: 2px 0 6px; word-break: break-word; }
  .card-stat { font-size: 0.95rem; }
  .bars { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; overflow-x: auto; }
  .bar-row { margin-bottom: 14px; }
  .bar-label { font-size: 0.82rem; display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }
  .metric-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .segment { color: var(--muted); }
  .bar-track { background: var(--border); border-radius: 4px; height: 10px; min-width: 200px; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .bar-meta { color: var(--muted); font-size: 0.75rem; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; font-size: 0.85rem; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; font-size: 0.78rem; text-transform: uppercase; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.rage { color: #e0555a; } td.dead { color: #d99a3d; } td.err { color: #b34cd1; }
  .empty { color: var(--muted); font-size: 0.85rem; }
  footer { padding: 16px 32px; color: var(--muted); font-size: 0.75rem; }
</style>
</head>
<body>
<header>
  <h1>Clarity UX / Performance Dashboard</h1>
  <div class="subtitle">Generated ${esc(generated)} · sources: ${esc((data.sourceFiles ?? []).join(", ") || "none")}</div>
</header>
<main>
  <section>
    <h2>Top findings</h2>
    <div class="cards">${findingCards(findings)}</div>
  </section>
  <section>
    <h2>All flagged segments (traffic-weighted severity)</h2>
    ${barChart(findings)}
  </section>
  ${sessionFlowSection(data.sessionEventFindings)}
</main>
<footer>clarity-skill · aggregated data via Clarity Data Export API (last 1-3 days)</footer>
</body>
</html>`;
}

function openInBrowser(filePath) {
  const abs = path.resolve(filePath);
  const platform = process.platform;
  const cmd = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", abs] : [abs];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = args.input ? readFileSync(args.input, "utf8") : readFileSync(0, "utf8");
  const data = JSON.parse(raw);

  const html = buildHtml(data);
  writeFileSync(args.out, html);
  console.error(`Dashboard written to ${path.resolve(args.out)}`);

  if (args.open) {
    openInBrowser(args.out);
  }
}

main();
