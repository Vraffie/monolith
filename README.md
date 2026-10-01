# Linkly

A small, self-hosted URL shortener with click analytics. One process, one SQLite
file, **zero dependencies** (Python 3.10+ standard library only).

## Features

- Shorten any `http(s)` URL; random 7-char slug or your own custom slug
- Optional expiry (`ttl_seconds`) — expired links answer `410 Gone`
- Click analytics: total, clicks per day, top referrers
- JSON API protected by a bearer token, plus a small web UI at `/`
- `purge` command to delete expired links (cron-friendly)

## Quick start

```bash
make run                                   # or: python3 -m shortener serve
# LINKLY_TOKEN not set -> a token is generated and printed on startup
```

Open <http://127.0.0.1:8080/>, paste the token, shorten a link.

Or via the API:

```bash
export LINKLY_TOKEN=change-me
python3 -m shortener serve &

curl -X POST localhost:8080/api/links -H "Authorization: Bearer $LINKLY_TOKEN" \
     -d '{"url":"https://example.com/long/path","slug":"docs","ttl_seconds":86400}'
curl -i localhost:8080/docs                # 302 -> https://example.com/long/path
curl localhost:8080/api/links/docs/stats -H "Authorization: Bearer $LINKLY_TOKEN"
```

## Configuration

| Variable          | Default      | Purpose                                                |
|-------------------|--------------|--------------------------------------------------------|
| `LINKLY_TOKEN`    | generated    | Bearer token for the API/UI. **Set it in production.** |
| `LINKLY_HOST`     | `127.0.0.1`  | Bind address                                           |
| `LINKLY_PORT`     | `8080`       | Port                                                   |
| `LINKLY_DB`       | `linkly.db`  | SQLite file path                                       |
| `LINKLY_BASE_URL` | request Host | Public origin used in returned `short_url`s            |

## API

All `/api/*` routes need `Authorization: Bearer <token>`. Errors are `{"error": "..."}`.

| Method & path                 | Description                                  | Success |
|-------------------------------|----------------------------------------------|---------|
| `POST /api/links`             | body: `url`, optional `slug`, `ttl_seconds`  | 201     |
| `GET /api/links?limit&offset` | newest first (limit ≤ 200)                   | 200     |
| `GET /api/links/{slug}`       | one link                                     | 200     |
| `GET /api/links/{slug}/stats?days=7` | clicks/day + top referrers           | 200     |
| `DELETE /api/links/{slug}`    | delete link and its clicks                   | 204     |
| `GET /{slug}`  *(public)*     | redirect and record click                    | 302 / 410 / 404 |
| `GET /health`  *(public)*     | liveness                                     | 200     |

Status codes: `400` validation, `401` bad token, `404` unknown, `409` slug taken.

## Development

```bash
make test          # 20 tests: unit (domain, service) + end-to-end over real HTTP
```

Layout:

```
shortener/
  domain.py    pure rules: validation, slug generation, errors   (no I/O)
  storage.py   SQLite repository — the only place with SQL
  service.py   use-cases; injectable clock for deterministic tests
  web.py       HTTP adapter: routing, auth, JSON, security headers
  config.py    env-var configuration
  ui.html      single-file admin UI (no build step)
tests/         unit + integration tests
docs/          product brief, architecture, ADRs
```

See [docs/PRODUCT.md](docs/PRODUCT.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
