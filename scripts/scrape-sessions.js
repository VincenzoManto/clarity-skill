#!/usr/bin/env node
// Reads individual session recordings from the Clarity dashboard UI using a
// saved login (see clarity-login.js) and writes them out in the
// sessions.json shape documented in references/session-event-format.md, so
// they plug straight into analyze.js / generate-dashboard.js.
//
// WHY THIS EXISTS: Clarity's public Data Export API only returns aggregated
// metrics (references/clarity-api.md) — individual recordings/events are
// only ever rendered in the dashboard UI. This script automates that UI.
//
// FRAGILITY WARNING: the CSS selectors below are best-effort and WILL break
// whenever Microsoft changes the Clarity dashboard markup, because there is
// no public contract for this UI (unlike the documented API). If this script
// stops finding rows, inspect the live Recordings page (DevTools → Elements)
// and update the SELECTORS block. Don't silently widen selectors to "grab
// anything that looks like a row" without checking what actually matched —
// that's how you end up analyzing garbage data.
//
// Usage:
//   node scripts/clarity-login.js                 # once, to authenticate
//   node scripts/scrape-sessions.js --project <projectId> --limit 30 --out sessions.json
//
// Requires: npm install playwright && npx playwright install chromium

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SELECTORS = {
  // Candidate selectors tried in order for each concern — first match wins.
  // Update/add to these if Clarity changes its markup.
  recordingRow: ['[data-testid="recording-row"]', '[role="row"]', 'div[class*="RecordingRow"]', 'div[class*="recording-item"]'],
  url: ['[data-testid="recording-url"]', 'a[href*="http"]', '[class*="url"]'],
  device: ['[data-testid="recording-device"]', '[class*="device"]'],
  browser: ['[data-testid="recording-browser"]', '[class*="browser"]'],
  duration: ['[data-testid="recording-duration"]', '[class*="duration"]'],
  timestamp: ['time', '[data-testid="recording-time"]', '[class*="timestamp"]'],
  rageBadge: ['[data-testid="badge-rage-click"]', '[aria-label*="Rage" i]', '[title*="Rage" i]'],
  deadBadge: ['[data-testid="badge-dead-click"]', '[aria-label*="Dead click" i]', '[title*="Dead click" i]'],
  errorBadge: ['[aria-label*="error" i]', '[title*="error" i]'],
};

function parseArgs(argv) {
  const args = { limit: 30, out: "sessions.json", stateFile: ".clarity-cache/auth-state.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") args.project = argv[++i];
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--state") args.stateFile = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.project) {
    console.error(
      "Missing --project <projectId>. Find it in your Clarity dashboard URL: " +
        "clarity.microsoft.com/projects/view/<projectId>/..."
    );
    process.exit(1);
  }

  if (!existsSync(args.stateFile)) {
    console.error(
      `No saved session at ${args.stateFile}. Run scripts/clarity-login.js first.`
    );
    process.exit(1);
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error(
      "playwright is not installed. Run:\n  npm install playwright\n  npx playwright install chromium"
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: args.stateFile });
  const page = await context.newPage();

  const url = `https://clarity.microsoft.com/projects/view/${args.project}/recordings`;
  console.error(`Navigating to ${url}`);
  await page.goto(url, { waitUntil: "networkidle" });

  // Give the SPA time to render + let virtualized lists mount initial rows.
  await page.waitForTimeout(2000);

  // Scroll to load more rows, up to the requested limit.
  let rowCount = 0;
  for (let i = 0; i < 20; i++) {
    rowCount = await countMatches(page, SELECTORS.recordingRow);
    if (rowCount >= args.limit) break;
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(800);
  }

  console.error(`Found ${rowCount} candidate recording rows (requested ${args.limit}).`);
  if (rowCount === 0) {
    console.error(
      "No rows matched any candidate selector. The Clarity dashboard markup " +
        "has likely changed — inspect the live page and update SELECTORS in " +
        "this script."
    );
  }

  const sessions = await extractSessions(page, args.limit);

  mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  writeFileSync(args.out, JSON.stringify({ sessions }, null, 2));
  console.error(`Wrote ${sessions.length} sessions to ${path.resolve(args.out)}`);
  console.error(
    "Note: this captures session METADATA and flagged-event markers visible " +
      "in the recordings list/detail UI (URL, device, browser, duration, " +
      "rage/dead-click/error flags) — not raw mouse-movement replay data, " +
      "which Clarity renders as a reconstructed player rather than exposing " +
      "as structured data."
  );

  await browser.close();
}

async function countMatches(page, candidates) {
  for (const sel of candidates) {
    const n = await page.locator(sel).count().catch(() => 0);
    if (n > 0) return n;
  }
  return 0;
}

async function extractSessions(page, limit) {
  return await page.evaluate(
    ({ selectors, limit }) => {
      function firstMatch(root, sels) {
        for (const sel of sels) {
          const el = root.querySelector(sel);
          if (el) return el;
        }
        return null;
      }
      function text(el) {
        return el ? el.textContent.trim() : null;
      }

      let rows = [];
      for (const sel of selectors.recordingRow) {
        rows = Array.from(document.querySelectorAll(sel));
        if (rows.length > 0) break;
      }

      return rows.slice(0, limit).map((row) => {
        const urlEl = firstMatch(row, selectors.url);
        const events = [];
        if (firstMatch(row, selectors.rageBadge)) events.push({ type: "click", rage: true, dead: false });
        if (firstMatch(row, selectors.deadBadge)) events.push({ type: "click", rage: false, dead: true });
        if (firstMatch(row, selectors.errorBadge)) events.push({ type: "error", message: "flagged in recordings list" });

        return {
          sessionId: row.getAttribute("data-session-id") || row.id || null,
          url: urlEl ? (urlEl.getAttribute("href") || text(urlEl)) : null,
          device: text(firstMatch(row, selectors.device)),
          browser: text(firstMatch(row, selectors.browser)),
          durationLabel: text(firstMatch(row, selectors.duration)),
          timestampLabel: text(firstMatch(row, selectors.timestamp)),
          events,
        };
      });
    },
    { selectors: SELECTORS, limit }
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
