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
  "clicks": 3
}
```
Timestamps are Unix seconds (UTC). `expires_at` is `null` for links that never expire.

## Endpoints

### `POST /api/links` — create
| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `url` | string | yes | `http`/`https`, has host, ≤ 2048 chars, no whitespace |
| `slug` | string | no | 3–32 chars of `A-Z a-z 0-9 _ -`; not reserved (`api`, `health`, `metrics`, `static`, `favicon.ico`, `robots.txt`, case-insensitive) |
| `ttl_seconds` | integer | no | 1 – 315 360 000 (10 years) |

Limited to `HITCHLY_CREATE_LIMIT` (default 60) successful creations per client per minute, then `429`.
Returns `201` with the link object and `Location: /api/links/{slug}`.
Without `slug`, a random 7-character one is generated.

```bash
curl -X POST localhost:8080/api/links -H "Authorization: Bearer $HITCHLY_TOKEN" \
     -d '{"url":"https://example.com","slug":"docs","ttl_seconds":3600}'
```

### `GET /api/links` — list
Query: `limit` (default 50, clamped to 1–200), `offset` (default 0). Newest first.
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
`days` is the look-back window for `clicks_per_day` (default 7). `total_clicks` is all-time.
Days with no clicks are omitted. Up to 5 referrers are returned.

### `PATCH /api/links/{slug}` — edit
Body may contain `url` and/or `ttl_seconds`; anything else (including `slug`) is a `400`.
`ttl_seconds` restarts the countdown from now; `null` removes the expiry (this also revives an expired link).
Returns the updated link object.

### `GET /api/links/{slug}/clicks.csv` — raw click log
`text/csv` with columns `timestamp_utc,referrer,user_agent`, oldest first (max 10 000 rows).
Cells beginning with `= + - @` are prefixed with `'` so spreadsheets don't evaluate them.

### `DELETE /api/links/{slug}` — delete
Returns `204`. Click history is deleted with the link.

### `GET /{slug}` — redirect (public)
- `302` with `Location: <url>` and `Cache-Control: no-store`; the click (time, `Referer`, `User-Agent`) is recorded.
- `410` plain text if expired (not counted); `404` if unknown.

### `GET /metrics` — Prometheus metrics (token required)
`hitchly_links`, `hitchly_links_expired` (gauges) and `hitchly_clicks_total` (counter), text exposition format.

### `GET /health` — liveness (public)
`200 {"status":"ok","version":"1.1.0"}`
