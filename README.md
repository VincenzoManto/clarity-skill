# clarity-skill

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-skill-5A45FF)](https://claude.com/claude-code)
[![GitHub stars](https://img.shields.io/github/stars/VincenzoManto/clarity-skill?style=social)](https://github.com/VincenzoManto/clarity-skill/stargazers)

Point [Claude Code](https://claude.com/claude-code) at your [Microsoft
Clarity](https://clarity.microsoft.com) project and get back ranked,
actionable UX/performance/UI fixes — not just a metrics dump.

It pulls aggregated metrics from the official Data Export API (rage clicks,
dead clicks, script errors, excessive scroll, quickback, scroll depth,
engagement time), optionally merges per-session/event exports, ranks the
findings by traffic-weighted severity, and — when run inside your codebase —
proposes or applies the actual fix.

If this is useful, a ⭐ on the repo helps other people find it.

## What it does

1. **Fetches aggregated metrics** from the Clarity Data Export API
   (`RageClickCount`, `DeadClickCount`, `ScriptErrorCount`, `ExcessiveScroll`,
   `QuickbackClick`, `ScrollDepth`, `EngagementTime`, `Traffic`), broken down
   by URL, device, browser, etc. Caches responses locally to stay under
   Clarity's 10-requests/day/project limit.
2. **Optionally ingests per-session/event data** if you have it (Clarity
   itself doesn't expose raw session recordings via a public API — only the
   dashboard UI has that).
3. **Ranks findings** by traffic-weighted severity against your project
   baseline (see `references/metrics-guide.md` for the heuristics).
4. **Produces** a written report, an HTML dashboard artifact, and — when run
   inside a codebase — proposed or applied code fixes for the flagged pages.

## Install

### Option A — copy or clone into your skills folder

Project-scoped (only this project):
```powershell
git clone https://github.com/<your-username>/clarity-skill "<project>\.claude\skills\clarity-skill"
```

User-scoped (all your projects):
```powershell
git clone https://github.com/<your-username>/clarity-skill "$env:USERPROFILE\.claude\skills\clarity-skill"
```

Or symlink instead of cloning, if you want local edits to apply everywhere:
```powershell
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.claude\skills\clarity-skill" -Target "C:\path\to\your\local\clarity-skill"
```

### Option B — install as a Claude Code plugin

```
/plugin marketplace add <your-username>/clarity-skill
/plugin install clarity-skill
```

## Setup

Generate a Clarity API token: Clarity dashboard → **Settings → Data Export →
API tokens** (max 5 active tokens per project), then set it before using the
skill:

```powershell
$env:CLARITY_API_TOKEN = "your-token-here"
```

## Usage

Just ask Claude Code something like:

> "Analizza i dati di Clarity dell'ultima settimana e proponi fix UX"
> "Usa clarity-skill per capire perché la pagina checkout ha tanti rage click"

Claude will run the scripts, analyze the results, and walk you through
findings + fixes. You can also run the scripts directly:

```powershell
node scripts/fetch-clarity.js --days 3 --dim1 URL --dim2 Device
node scripts/analyze.js > analysis.json
node scripts/generate-dashboard.js --input analysis.json --open
```

The last command opens a self-contained, offline HTML dashboard in your
default browser — top findings, severity-ranked bars per segment, and (if
you supplied a session/event export) a per-page rage/dead-click/error table.

## Files

- `SKILL.md` — the skill definition Claude Code reads.
- `scripts/fetch-clarity.js` — calls the Clarity Data Export API, caches
  responses to `.clarity-cache/`.
- `scripts/analyze.js` — merges cached data (+ optional session/event
  export) into ranked findings.
- `references/clarity-api.md` — API endpoint, auth, params, rate limits.
- `references/metrics-guide.md` — what each metric means and the thresholds
  used to flag issues.
- `references/session-event-format.md` — expected shape for optional
  per-session/event export files.

## Limitations

Microsoft Clarity's public API only exposes **aggregated** metrics for the
**last 1–3 days**, rate-limited to **10 requests/day/project**. It does not
expose individual session recordings or raw event streams — that data only
exists in the Clarity dashboard UI. This skill treats session/event-level
analysis as an optional input you supply, not something it can fetch on its
own.

## License

MIT
