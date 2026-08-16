---
name: clarity-skill
description: Reads Microsoft Clarity aggregated project metrics (via the Data Export API) and, when available, per-session event exports, to surface performance/UX/UI problems and turn them into a prioritized report, a visual dashboard, and concrete code changes in the connected app. Triggers on "Clarity", "session recording", "rage click", "dead click", "heatmap", "quickback", "scroll depth", "UX audit from analytics", "migliora UX/performance con i dati di Clarity".
---

# Clarity Skill

Turns Microsoft Clarity data into shippable UX/performance/UI fixes. Two data
tiers, one pipeline:

1. **Aggregated project metrics** — official Clarity **Data Export API**
   (`project-live-insights`). This is the only officially supported
   programmatic source. It covers the **last 1–3 days only** and is
   **rate-limited to 10 requests/day per project**, returned as counts broken
   down by up to 3 dimensions (Browser, Device, OS, Country, URL, PageTitle,
   Source, Medium, Campaign, Channel).
2. **Per-session / per-event data** — Clarity does **not** expose raw session
   recordings or event streams through a public API; that data only lives in
   the dashboard UI. Two ways to get it into the pipeline:
   - The user hands you an export (manual export, custom snippet, saved
     JSON) — ingest it as documented in `references/session-event-format.md`.
   - Or use `scripts/clarity-login.js` + `scripts/scrape-sessions.js`, which
     drive a real browser against the user's own Clarity dashboard to read
     session metadata and rage/dead-click/error markers from the Recordings
     UI. This is DOM automation against an undocumented, changeable UI —
     **fragile by nature** (selectors break on any Clarity redesign) and it
     is the user's responsibility to confirm this stays within Clarity's
     Terms of Service for their use case. It captures session metadata and
     flagged-event markers, not raw mouse-movement replay data (Clarity
     renders that as a reconstructed player, not structured data).

Do not silently pretend tier 2 data is available. If the user asks for
"le sessioni singole" and neither an export nor a working scrape is in
place, say so and offer the two options above, or proceed with tier 1 only
and note the gap in the report.

## Workflow

1. **Check for an API token.** Read `CLARITY_API_TOKEN` from the environment
   (or ask the user where their Clarity API key is / have them create one in
   Clarity → Settings → Data Export → API tokens — max 5 active tokens per
   project).

2. **Fetch aggregated data, respecting the rate limit.**
   ```
   node scripts/fetch-clarity.js --days 3 --dim1 URL --dim2 Device --dim3 Browser
   ```
   - Before calling, check `.clarity-cache/` for a response fetched in the
     last few hours and reuse it unless the user explicitly wants a refresh —
     10 requests/day is easy to burn through.
   - Run it a few times with different dimension combinations (e.g. `URL`,
     `URL+Device`, `PageTitle+Browser`) to triangulate which pages/segments
     are worst, staying mindful of the daily cap.
   - If the request fails, don't guess at the API shape from memory — WebFetch
     the current Microsoft Learn "Clarity Data Export API" page and adjust
     `scripts/fetch-clarity.js` / `references/clarity-api.md` accordingly, the
     API has changed before.

3. **Optionally bring in per-session/event data**, either path:
   - **User-supplied export:** pass it straight to the analyzer:
     ```
     node scripts/analyze.js --events path/to/sessions.json
     ```
     Expected shape is documented in `references/session-event-format.md` —
     if the user's export doesn't match, adapt the parser rather than asking
     them to reshape their data.
   - **Scrape it from their own dashboard:**
     ```
     node scripts/clarity-login.js
     ```
     (one-time; opens a real browser, the user logs in manually, session is
     saved to `.clarity-cache/auth-state.json`, gitignored). Then:
     ```
     node scripts/scrape-sessions.js --project <projectId> --limit 30 --out sessions.json
     node scripts/analyze.js --events sessions.json
     ```
     `<projectId>` is the segment in the user's Clarity dashboard URL:
     `clarity.microsoft.com/projects/view/<projectId>/...`. If
     `scrape-sessions.js` reports 0 matched rows, the dashboard markup has
     likely changed — inspect the live Recordings page and update the
     `SELECTORS` block at the top of that script before trying again; don't
     guess blindly.

4. **Analyze.** Run:
   ```
   node scripts/analyze.js
   ```
   This reads everything cached in `.clarity-cache/`, merges dimension
   breakdowns, and prints a JSON list of findings sorted by severity
   (see `references/metrics-guide.md` for the thresholds/heuristics used —
   rage clicks, dead clicks, script/error clicks, excessive scroll, quickback,
   low scroll depth vs. high traffic, low engagement time vs. high traffic).

5. **Turn findings into three deliverables:**
   - **Report (always):** a short markdown/chat summary — top issues ranked
     by impact (traffic-weighted), which URL/device/browser segment each hits,
     and the concrete fix per issue.
   - **Interactive dashboard (always, when there are findings):** generate
     and open it locally:
     ```
     node scripts/analyze.js > analysis.json
     node scripts/generate-dashboard.js --input analysis.json --out clarity-dashboard.html --open
     ```
     `--open` launches the file in the user's default browser (Windows/macOS/
     Linux). The HTML is self-contained (no CDN), theme-aware, and charts
     only what `analyze.js` actually produced — never fabricate data. If the
     user is working inside a Claude Code chat session and wants a shareable
     link instead of/in addition to the local file, also load the `dataviz`
     skill and publish the same data via the `Artifact` tool.
   - **Code changes (when a codebase is present):** for each finding, locate
     the relevant component/page (Grep/Glob for the URL path or page title in
     the connected repo) and propose or apply the fix — e.g. a dead-click
     hotspot on a non-interactive element usually means missing
     `cursor:pointer`/affordance or a broken handler; a rage-click cluster
     often means a slow/silent async action needs a loading state; excessive
     scroll + low engagement often means the primary CTA needs to move above
     the fold. Confirm before applying edits unless the user asked to auto-fix.

## Files

- `scripts/fetch-clarity.js` — calls the Clarity Data Export API, caches raw
  responses to `.clarity-cache/`.
- `scripts/analyze.js` — merges cached aggregated data (+ optional session
  events) into ranked findings.
- `scripts/generate-dashboard.js` — renders `analyze.js`'s output as a
  self-contained, theme-aware HTML dashboard and can open it in the browser.
- `scripts/clarity-login.js` — one-time interactive login against the
  user's own Clarity dashboard, saves an authenticated session locally.
- `scripts/scrape-sessions.js` — reads session metadata and rage/dead-click/
  error markers from the Recordings UI using the saved login; best-effort,
  documented as fragile (see file header).
- `references/clarity-api.md` — endpoint, auth, params, response fields,
  rate limits.
- `references/metrics-guide.md` — what each metric means and the thresholds
  `analyze.js` uses to flag something as an issue.
- `references/session-event-format.md` — expected shape for optional
  per-session/event export files.
