# Metrics guide — what to flag and why

Thresholds below are heuristics used by `scripts/analyze.js`
(`severity = impact x confidence`, traffic-weighted). Tune them once real
project data shows what's noise vs. signal for this site.

| Metric | Signals | Likely cause | Typical fix |
|---|---|---|---|
| `RageClickCount` | > 5% of sessions on a URL, or a segment far above the project average | User clicked repeatedly and fast — something looked interactive but didn't respond, or feedback was too slow | Add loading state, fix broken handler, debounce double-submits |
| `DeadClickCount` | > 5% of sessions on a URL | Click on an element that isn't actually interactive | Add `cursor:pointer`/affordance styling, or make the element clickable, or remove the visual cue |
| `ScriptErrorCount` / `ErrorClickCount` | any non-trivial count, especially concentrated on one Browser/Device | JS runtime error breaking the page for a subset of users | Reproduce with that Browser/Device combo, fix the error, add error boundary/logging |
| `ExcessiveScroll` | high relative to `Traffic` on a URL | Page is too long / key info buried, forcing hunting | Restructure content, add anchors/nav, move key content up |
| `QuickbackClick` | high relative to `Traffic`, especially from a given `Source`/`Campaign` | Page didn't match expectation (slow load, wrong content, misleading link/ad copy) | Check load time for that segment, align landing content with the referring source |
| `ScrollDepth` | low average while `Traffic` is high | Users aren't reaching key content/CTA below the fold | Move primary CTA/content above the fold, shorten the page |
| `EngagementTime` | low while `Traffic` is high, without a corresponding high `QuickbackClick` | Content isn't holding attention, or task completes unexpectedly fast (could be good or bad — check accompanying metrics) | Cross-check against QuickbackClick and business goal for that page before treating as a problem |

## Segmenting

Always compare a dimension value against the project-wide baseline for that
metric, not an absolute number — "12% rage clicks" only means something next
to "vs. 2% project average." Fetch at least one un-dimensioned baseline
request alongside the dimensioned ones.

## Prioritization

Rank findings by `(metric rate above baseline) x (session count for that
segment)` — a 3x rage-click rate on a low-traffic page matters less than a
1.5x rate on the checkout page. Surface the top 5–8 findings, not every blip.
