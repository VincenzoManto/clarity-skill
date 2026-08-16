#!/usr/bin/env node
// Opens a real (headed) browser against clarity.microsoft.com and waits for
// you to log in manually, then saves the authenticated session so
// scrape-sessions.js can reuse it without asking for credentials again.
//
// This exists because reading individual session recordings is only
// possible through the dashboard UI — Clarity's public API does not expose
// them (see references/clarity-api.md). Automating your own dashboard with
// your own login is different from scraping someone else's data, but it is
// still DOM automation against a UI Microsoft doesn't publish a contract
// for: it can break on any Clarity UI change, and you're responsible for
// checking that this stays within Clarity's Terms of Service for your use
// case.
//
// Usage:
//   node scripts/clarity-login.js
//
// Requires: npm install playwright && npx playwright install chromium

import { mkdirSync } from "node:fs";
import path from "node:path";

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error(
      "playwright is not installed. Run:\n  npm install playwright\n  npx playwright install chromium"
    );
    process.exit(1);
  }

  const cacheDir = path.resolve(process.cwd(), ".clarity-cache");
  mkdirSync(cacheDir, { recursive: true });
  const statePath = path.join(cacheDir, "auth-state.json");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://clarity.microsoft.com/projects");

  console.error(
    "A browser window opened. Log in to Clarity manually (including any " +
      "2FA/SSO steps), navigate until you see your projects list, then come " +
      "back here and press Enter."
  );
  await new Promise((resolve) => {
    process.stdin.once("data", resolve);
  });

  await context.storageState({ path: statePath });
  console.error(`Saved authenticated session to ${statePath}`);
  console.error(
    "This file grants access to your Clarity account — it's already covered " +
      "by .gitignore (.clarity-cache/), don't commit or share it."
  );

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
