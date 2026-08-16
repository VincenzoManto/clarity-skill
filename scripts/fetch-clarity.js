#!/usr/bin/env node
// Fetches aggregated project metrics from the Microsoft Clarity Data Export
// API and caches the raw response. See references/clarity-api.md.
//
// Usage:
//   node fetch-clarity.js --days 3 [--dim1 URL] [--dim2 Device] [--dim3 Browser] [--force]
//
// Requires CLARITY_API_TOKEN in the environment.

import { mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve(process.cwd(), ".clarity-cache");
const ENDPOINT = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const MAX_FRESH_HOURS = 6;

function parseArgs(argv) {
  const args = { days: 3, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--days") args.days = Number(argv[++i]);
    else if (a === "--dim1") args.dim1 = argv[++i];
    else if (a === "--dim2") args.dim2 = argv[++i];
    else if (a === "--dim3") args.dim3 = argv[++i];
    else if (a === "--force") args.force = true;
  }
  return args;
}

function cacheKey(args) {
  return ["days" + args.days, args.dim1, args.dim2, args.dim3]
    .filter(Boolean)
    .join("_");
}

function findFreshCache(key) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const prefix = `${key}__`;
  const candidates = readdirSync(CACHE_DIR).filter((f) => f.startsWith(prefix));
  if (candidates.length === 0) return null;
  candidates.sort().reverse();
  const latest = candidates[0];
  const ageMs = Date.now() - statSync(path.join(CACHE_DIR, latest)).mtimeMs;
  if (ageMs < MAX_FRESH_HOURS * 3600 * 1000) return latest;
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) {
    console.error(
      "CLARITY_API_TOKEN is not set. Generate one in Clarity → Settings → Data Export → API tokens."
    );
    process.exit(1);
  }

  const key = cacheKey(args);

  if (!args.force) {
    const fresh = findFreshCache(key);
    if (fresh) {
      console.error(`Reusing cached response (< ${MAX_FRESH_HOURS}h old): ${fresh}`);
      console.log(path.join(CACHE_DIR, fresh));
      return;
    }
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("numOfDays", String(args.days));
  if (args.dim1) url.searchParams.set("dimension1", args.dim1);
  if (args.dim2) url.searchParams.set("dimension2", args.dim2);
  if (args.dim3) url.searchParams.set("dimension3", args.dim3);

  console.error(`Fetching ${url.toString()}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `Clarity API request failed: ${res.status} ${res.statusText}\n${body}\n` +
        "If this looks like a schema/auth change, re-check references/clarity-api.md " +
        "against https://learn.microsoft.com/en-us/clarity/data-export"
    );
    process.exit(1);
  }

  const data = await res.json();
  mkdirSync(CACHE_DIR, { recursive: true });
  const filename = `${key}__${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filepath = path.join(CACHE_DIR, filename);
  writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.error(`Saved ${filepath}`);
  console.log(filepath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
