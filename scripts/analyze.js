#!/usr/bin/env node
// Merges cached Clarity Data Export API responses (+ optional session/event
// export) into a ranked list of findings. See references/metrics-guide.md
// for the heuristics used here.
//
// Usage:
//   node analyze.js [--events path/to/sessions.json] [--cache-dir .clarity-cache]

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIMENSIONS = ["URL", "PageTitle", "Device", "Browser", "OS", "Country", "Source", "Medium", "Campaign", "Channel"];

// Metrics we actively flag, and how "bad" scales (rate of sessions hit).
const RATE_METRICS = [
  "RageClickCount",
  "DeadClickCount",
  "ScriptErrorCount",
  "ErrorClickCount",
  "ExcessiveScroll",
  "QuickbackClick",
];

function parseArgs(argv) {
  const args = { cacheDir: ".clarity-cache" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--events") args.events = argv[++i];
    else if (a === "--cache-dir") args.cacheDir = argv[++i];
  }
  return args;
}

function loadCachedResponses(cacheDir) {
  let files;
  try {
    files = readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files.map((f) => {
    try {
      return { file: f, data: JSON.parse(readFileSync(path.join(cacheDir, f), "utf8")) };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// Pull a numeric value out of a row for a given metric, tolerating the API's
// inconsistent field naming (e.g. totalRageClickCount, totalSessionCount).
function findNumericField(row, hints) {
  for (const key of Object.keys(row)) {
    const lower = key.toLowerCase();
    if (hints.some((h) => lower.includes(h.toLowerCase()))) {
      const n = Number(row[key]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function extractDimensionKey(row) {
  const parts = [];
  for (const dim of DIMENSIONS) {
    if (row[dim] !== undefined) parts.push(`${dim}=${row[dim]}`);
  }
  return parts.length ? parts.join(",") : "(project-wide)";
}

function analyzeAggregated(responses) {
  // metricName -> segmentKey -> { count, sessions }
  const perMetric = {};

  for (const { data } of responses) {
    if (!Array.isArray(data)) continue;
    for (const metricBlock of data) {
      const metricName = metricBlock.metricName;
      if (!metricName || !Array.isArray(metricBlock.information)) continue;
      perMetric[metricName] ??= {};
      for (const row of metricBlock.information) {
        const segKey = extractDimensionKey(row);
        const count = findNumericField(row, [metricName.replace("Count", "")]) ??
          findNumericField(row, ["count", "total"]);
        const sessions = findNumericField(row, ["sessioncount", "traffic"]);
        if (count === null) continue;
        perMetric[metricName][segKey] ??= { count: 0, sessions: 0 };
        perMetric[metricName][segKey].count += count;
        if (sessions) perMetric[metricName][segKey].sessions += sessions;
      }
    }
  }

  const findings = [];
  for (const metricName of RATE_METRICS) {
    const segments = perMetric[metricName];
    if (!segments) continue;

    const baseline = segments["(project-wide)"];
    const baselineRate = baseline && baseline.sessions
      ? baseline.count / baseline.sessions
      : null;

    for (const [segKey, stat] of Object.entries(segments)) {
      if (segKey === "(project-wide)" || !stat.sessions) continue;
      const rate = stat.count / stat.sessions;
      const ratio = baselineRate ? rate / baselineRate : null;
      // Flag if meaningfully above baseline (or no baseline: flag high absolute rate).
      const isFlagged = ratio !== null ? ratio >= 1.5 : rate >= 0.05;
      if (!isFlagged) continue;
      findings.push({
        metric: metricName,
        segment: segKey,
        rate: Number(rate.toFixed(4)),
        baselineRate: baselineRate !== null ? Number(baselineRate.toFixed(4)) : null,
        ratioVsBaseline: ratio !== null ? Number(ratio.toFixed(2)) : null,
        sessions: stat.sessions,
        count: stat.count,
        severity: Number((rate * stat.sessions * (ratio ?? 2)).toFixed(2)),
      });
    }
  }

  findings.sort((a, b) => b.severity - a.severity);
  return findings;
}

function analyzeEvents(filePath) {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const sessions = raw.sessions ?? (Array.isArray(raw) ? raw : []);

  const byUrl = {};
  for (const session of sessions) {
    const url = session.url ?? session.page ?? "(unknown)";
    byUrl[url] ??= { sessions: 0, rageClicks: 0, deadClicks: 0, errors: 0 };
    byUrl[url].sessions += 1;
    for (const ev of session.events ?? []) {
      if (ev.type === "click" && ev.rage) byUrl[url].rageClicks += 1;
      if (ev.type === "click" && ev.dead) byUrl[url].deadClicks += 1;
      if (ev.type === "error") byUrl[url].errors += 1;
    }
  }

  return Object.entries(byUrl)
    .map(([url, stat]) => ({ url, ...stat }))
    .sort((a, b) => (b.rageClicks + b.deadClicks + b.errors) - (a.rageClicks + a.deadClicks + a.errors));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const responses = loadCachedResponses(args.cacheDir);

  if (responses.length === 0) {
    console.error(
      `No cached data found in ${args.cacheDir}. Run fetch-clarity.js first.`
    );
  }

  const result = {
    aggregatedFindings: analyzeAggregated(responses),
    sourceFiles: responses.map((r) => r.file),
  };

  if (args.events) {
    result.sessionEventFindings = analyzeEvents(args.events);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
