# Clarity Data Export API

Official docs: https://learn.microsoft.com/en-us/clarity/data-export
(re-check this page if requests start failing — the schema has changed
before and this file may drift out of date).

## Auth

- Generate a token in the Clarity dashboard: **Settings → Data Export → API
  tokens**. Max 5 active tokens per project.
- Send as `Authorization: Bearer <token>`.

## Endpoint

```
GET https://www.clarity.ms/export-data/api/v1/project-live-insights
```

### Query params

| Param | Required | Notes |
|---|---|---|
| `numOfDays` | yes | Integer 1–3. Clarity only retains this endpoint's data for the last 3 days. |
| `dimension1` | no | One of: `Browser`, `Device`, `Country`, `OS`, `Source`, `Medium`, `Campaign`, `Channel`, `PageTitle`, `URL`. |
| `dimension2` | no | Same set as above, combine for a breakdown. |
| `dimension3` | no | Same set as above. |

### Rate limit

**10 requests per project per day.** Cache responses locally
(`.clarity-cache/`) and reuse them — don't re-fetch on every analysis run.

### Response shape (per metric object)

The response is a JSON array; each element covers one metric, with an
`information` array of rows broken down by the requested dimensions:

```json
[
  {
    "metricName": "RageClickCount",
    "information": [
      {
        "URL": "/checkout",
        "Device": "Mobile",
        "totalRageClickCount": "128",
        "totalSessionCount": "540",
        "sessionsWithMetricPercentage": "23.7"
      }
    ]
  }
]
```

### Metrics returned

`Traffic`, `EngagementTime`, `ScrollDepth`, `DeadClickCount`,
`ExcessiveScroll`, `RageClickCount`, `QuickbackClick`, `ScriptErrorCount`,
`ErrorClickCount`. Field names inside `information` vary slightly per
metric (e.g. `totalTime`, `totalDeadClickCount`, `totalScrollDepth`) — see
`scripts/analyze.js` for the exact keys it reads, and adjust there if a
response comes back with unexpected field names.

## What's NOT available via this API

- Individual session recordings/replays.
- Raw event streams (individual clicks, mouse moves, per-session scroll
  timelines).
- Anything beyond the last 3 days.

These only exist in the Clarity dashboard UI. If the user needs
session/event-level analysis, they must export or hand you that data some
other way — see `session-event-format.md`.
