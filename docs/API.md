# API reference

Base URL: wherever Hitchly runs, e.g. `http://127.0.0.1:8080`.
Bodies and responses are JSON (`Content-Type: application/json`). Request bodies are limited to 8 KiB.

## Authentication
All `/api/*` routes require `Authorization: Bearer <HITCHLY_TOKEN>`.
Missing/invalid token → `401` with `WWW-Authenticate: Bearer`.
More than `HITCHLY_AUTH_FAIL_LIMIT` (default 10) failures per client per minute → `429` with `Retry-After`;
while locked out, even the correct token is refused.
`GET /{slug}`, `GET /health` and `GET /` are public.

## Errors
Every error is `{"error": "<message>"}`.

| Status | Meaning |
|-------:|---------|
| 400 | Validation failed (bad URL, slug, ttl, JSON, query param, oversized body) |
| 401 | Missing or invalid token |
| 404 | Unknown slug or route |
| 409 | Custom slug already in use |
| 410 | Link expired (redirect route only) |
| 429 | Too many failed auth attempts, or too many links created; see `Retry-After` |
| 500 | Unexpected server error |

## Link object
```json
{
  "slug": "docs",
  "short_url": "http://localhost:8080/docs",
  "url": "https://example.com/long/path",
  "created_at": 1790857245,
  "expires_at": null,
  "expired": false,
  "clicks": 3,
  "bot_clicks": 1,
  "tags": ["docs", "launch"],
  "max_visits": null,
  "exhausted": false
}
```
`clicks` counts human visits; `bot_clicks` counts crawlers, link-preview fetchers, scripts, requests without a User-Agent, and every `HEAD`
(see [Bot filtering](#bot-filtering)). Timestamps are Unix seconds (UTC). `expires_at` is `null` for links that never expire.

## Bot filtering
Every redirect is recorded, but classified at record time by a User-Agent heuristic (`hitchly/bots.py`): empty User-Agents, crawlers
(Googlebot…), link-preview fetchers (Slack, WhatsApp, Facebook, Telegram, Discord…), HTTP libraries (curl, python-requests, Go…) and
headless browsers count as bots. All `HEAD` requests count as bots. Bots are still redirected normally. This is a heuristic: it reduces
accidental inflation, it does not stop someone who deliberately sends a browser User-Agent. Existing clicks are classified by a migration.

## Endpoints

### `POST /api/links` — create
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `url` | string | yes | `http`/`https`, has host, ≤ 2048 chars, no whitespace |
| `slug` | string | no | 3–32 chars of `A-Z a-z 0-9 _ -`; not reserved (`api`, `health`, `metrics`, `static`, `favicon.ico`, `robots.txt`, case-insensitive) |
| `ttl_seconds` | integer | no | 1 – 315 360 000 (10 years) |
| `max_visits` | integer | no | 1 – 1 000 000 000; after this many **human** visits the link answers `410` |
| `tags` | list of strings | no | ≤ 10; each 1–32 chars of `a-z 0-9 _ -` (lower-cased, de-duplicated) |

Limited to `HITCHLY_CREATE_LIMIT` (default 60) successful creations per client per minute, then `429`.
Returns `201` with the link object and `Location: /api/links/{slug}`.
Without `slug`, a random 7-character one is generated.

```bash
curl -X POST localhost:8080/api/links -H "Authorization: Bearer $HITCHLY_TOKEN" \
     -d '{"url":"https://example.com","slug":"docs","ttl_seconds":3600}'
```

### `GET /api/links` — list
Query: `limit` (default 50, clamped to 1–200), `offset` (default 0), `tag` (exact tag), `q` (case-insensitive substring of slug or target URL). Newest first; `total` honours the filters.
```json
{ "total": 12, "links": [ { "...link object..." } ] }
```

### `GET /api/links/{slug}` — fetch one
Returns the link object, or `404`.

### `GET /api/links/{slug}/stats?days=7` — analytics
```json
{
  "slug": "docs",
  "total_clicks": 42,
  "clicks_per_day": [{ "day": "2026-10-01", "clicks": 5 }],
  "top_referrers": [{ "referrer": "https://news.example/", "clicks": 3 }]
}
```
`days` is the look-back window for `clicks_per_day` (default 7). `total_clicks` is all-time human visits; `bot_clicks` is all-time bot visits.
`clicks_per_day` and `top_referrers` exclude bots unless you pass `include_bots=1` (`includes_bots` in the response says which).
Days with no clicks are omitted. Up to 5 referrers are returned.

### `PATCH /api/links/{slug}` — edit
Body may contain `url`, `ttl_seconds`, `max_visits` (`null` removes the cap; raising it revives an exhausted link) and/or `tags` (replaces the whole list; `[]` clears it); anything else (including `slug`) is a `400`.
`ttl_seconds` restarts the countdown from now; `null` removes the expiry (this also revives an expired link).
Returns the updated link object.

### `GET /api/links/{slug}/clicks.csv` — raw click log
`text/csv` with columns `timestamp_utc,referrer,user_agent,bot` (`bot` is 0/1; bots are included so you can analyse them), oldest first (max 10 000 rows).
Cells beginning with `= + - @` are prefixed with `'` so spreadsheets don't evaluate them.

### `GET /api/links/{slug}/qr.svg?scale=8` — QR code
`image/svg+xml` QR code (error correction M, 4-module quiet zone) encoding the short URL. `scale` is pixels per module.

### `DELETE /api/links/{slug}` — delete
Returns `204`. Click history is deleted with the link.

### `GET /{slug}` — redirect (public)
- `302` with `Location: <url>` and `Cache-Control: no-store`; the click (time, `Referer`, `User-Agent`) is recorded.
- `410` plain text if expired or the visit cap is used up (not counted); `404` if unknown.
  The cap is enforced atomically (a single conditional insert), so concurrent visitors cannot overshoot it. Bots neither consume nor bypass it.

### `GET /metrics` — Prometheus metrics (token required)
`hitchly_links`, `hitchly_links_expired` (gauges) and `hitchly_clicks_total` (counter), text exposition format.

### `GET /health` — liveness (public)
`200 {"status":"ok","version":"1.1.0"}`
