# Optional per-session/event export format

Microsoft Clarity does not expose session recordings or raw event streams
through a public API — this tier is optional. It's populated either by the
user handing you an export, or by `scripts/scrape-sessions.js` (browser
automation against the user's own dashboard — see `SKILL.md` for the
fragility/ToS caveats). `scripts/analyze.js --events <file>` expects (and
will try to adapt to close variants of) this shape:

```json
{
  "sessions": [
    {
      "sessionId": "abc123",
      "url": "/checkout",
      "device": "Mobile",
      "browser": "Chrome",
      "startTime": "2026-08-14T10:03:00Z",
      "durationMs": 45210,
      "events": [
        { "type": "click", "target": "button.submit", "timestampMs": 1200, "rage": false, "dead": false },
        { "type": "scroll", "depthPercent": 62, "timestampMs": 3400 },
        { "type": "click", "target": "div.promo-banner", "timestampMs": 5100, "rage": true, "dead": false },
        { "type": "error", "message": "TypeError: cannot read property 'x'", "timestampMs": 8000 },
        { "type": "navigation", "to": "/cart", "timestampMs": 12000 }
      ]
    }
  ]
}
```

If the user's export is CSV, a flat event list, or a different tool
entirely (Hotjar, PostHog, FullStory, a custom logger), don't ask them to
reshape it — read what they have and adapt the parsing in `analyze.js`
(or a one-off conversion step) instead. The important fields to extract
regardless of source format: session URL/page, device/browser, event type
(click/scroll/error/navigation), whether a click was flagged rage/dead, and
timestamps relative to session start.
