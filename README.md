# Hitchly

A small, self-hosted URL shortener with click analytics, **plus a browser toolbox of 37 everyday tools**
(QR codes, redirect tracer, diff, cron, converters, TOTP, subnets, Base64, JWT, hashes, UUIDs, regex, …).
One process, one SQLite file, **zero dependencies** (Python 3.10+ standard library only).

## The toolbox (web UI at `/`)

| Group | Tools |
|-------|-------|
| Links | Short links (create, search, tags, edit, stats, QR), Bulk shorten |
| QR & URLs | QR generator (URL, Wi-Fi, contact card, email, SMS, phone, location), Redirect tracer, UTM builder, URL parser & cleaner |
| Encode & decode | Base64, URL encode/decode, Escape & unescape (HTML, JS, JSON, SQL), Text ⇄ bytes / Unicode / NATO, JWT decoder, Hash & HMAC, Encrypt & decrypt text (AES-GCM) |
| Generate | UUID v4/v7 & ULID, Password & token generator, TOTP (2FA) codes with QR, RSA/ECDSA/Ed25519 key pairs, Lorem ipsum |
| Format & convert | JSON formatter, JSON/YAML/XML/CSV converter, Text & JSON diff, Cron explainer, Timestamp converter, Colour & contrast, Regex tester, Text utilities, Number base converter, Unit / percentage / Roman numeral converters, chmod calculator, IBAN validator & email normaliser |
| Network & web | HTTP status & MIME reference, Subnet calculator (IPv4/IPv6, range → CIDR), Basic auth header |
| Admin | Dead-link checker, Import, Export, Maintenance (overview, purge, backup) |

Everything except the link and admin tools runs entirely in your browser and works signed out, even on a static host (see [docs/HOSTING.md](docs/HOSTING.md)).

## Features

- Shorten any `http(s)` URL; random 7-char slug or your own custom slug
- Optional expiry (`ttl_seconds`) — expired links answer `410 Gone`
- Click analytics: total, clicks per day, top referrers
- JSON API protected by a bearer token, plus a small web UI at `/`
- Per-link controls: expiry, max visits, password protection, tags and search
- Bot-filtered analytics (crawlers and link previews don't inflate clicks)
- QR code per link (SVG, no dependencies)
- Edit a link's target, expiry, tags or limits; export raw clicks as CSV
- `purge` and online `backup` commands (cron-friendly), Prometheus `/metrics`
- Brute-force protection on the token
- **Ecosystem:** [Python SDK](docs/SDK.md), [`hitch` CLI](docs/CLI.md) (bulk import/export, dead-link checker), Docker, CI

## Why Hitchly?
Shlink, YOURLS, Kutt and Dub offer more features (geo analytics, multi-domain, accounts, webhooks). Hitchly is for when you want
the *lightest complete* shortener: one Python process, one SQLite file, nothing to install, a remote CLI and SDK in the box, and
safe defaults (bot-filtered stats, hashed link passwords, rate limits, atomic visit caps). The honest comparison, including what we
deliberately don't build, is in [docs/COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md).

## Quick start

```bash
make run                                   # or: python3 -m hitchly serve
# HITCHLY_TOKEN not set -> a token is generated and printed on startup
```

Open <http://127.0.0.1:8080/>, paste the token, shorten a link.

Or via the API:

```bash
export HITCHLY_TOKEN=change-me
python3 -m hitchly serve &

curl -X POST localhost:8080/api/links -H "Authorization: Bearer $HITCHLY_TOKEN" \
     -d '{"url":"https://example.com/long/path","slug":"docs","ttl_seconds":86400}'
curl -i localhost:8080/docs                # 302 -> https://example.com/long/path
curl localhost:8080/api/links/docs/stats -H "Authorization: Bearer $HITCHLY_TOKEN"
```

## Command-line client

```bash
export HITCHLY_TOKEN=change-me
hitch new https://example.com/long/path --slug docs --ttl 7d
hitch ls
hitch stats docs
hitch check          # which targets are dead?
```
More in [docs/CLI.md](docs/CLI.md); programmatic use in [docs/SDK.md](docs/SDK.md).

## Configuration

| Variable          | Default      | Purpose                                                |
|-------------------|--------------|--------------------------------------------------------|
| `HITCHLY_TOKEN`    | generated    | Bearer token for the API/UI. **Set it in production.** |
| `HITCHLY_HOST`     | `127.0.0.1`  | Bind address                                           |
| `HITCHLY_PORT`     | `8080`       | Port                                                   |
| `HITCHLY_DB`       | `hitchly.db`  | SQLite file path                                       |
| `HITCHLY_BASE_URL` | request Host | Public origin used in returned `short_url`s            |
| `HITCHLY_AUTH_FAIL_LIMIT` | `10`  | Failed auth attempts per client/minute before `429`    |
| `HITCHLY_CREATE_LIMIT` | `60`      | Link creations per client/minute before `429` (0 = off)      |
| `HITCHLY_TRUST_PROXY` | off       | Use `X-Forwarded-For` for client IP (only behind your proxy) |

## API

All `/api/*` routes need `Authorization: Bearer <token>`. Errors are `{"error": "..."}`.

| Method & path                 | Description                                  | Success |
|-------------------------------|----------------------------------------------|---------|
| `POST /api/links`             | body: `url`, optional `slug`, `ttl_seconds`  | 201     |
| `GET /api/links?limit&offset` | newest first (limit ≤ 200)                   | 200     |
| `GET /api/links/{slug}`       | one link                                     | 200     |
| `PATCH /api/links/{slug}`     | body: `url` and/or `ttl_seconds` (`null` = no expiry) | 200 |
| `GET /api/links/{slug}/clicks.csv` | raw click log                            | 200     |
| `GET /metrics`                | Prometheus metrics                           | 200     |
| `GET /api/links/{slug}/stats?days=7` | clicks/day + top referrers           | 200     |
| `DELETE /api/links/{slug}`    | delete link and its clicks                   | 204     |
| `GET /{slug}`  *(public)*     | redirect and record click                    | 302 / 410 / 404 |
| `GET /health`  *(public)*     | liveness                                     | 200     |

Full details: [docs/API.md](docs/API.md).

Status codes: `400` validation, `401` bad token, `404` unknown, `409` slug taken.

## Development

```bash
make test          # 113 Python tests: unit + end-to-end (server, SDK and CLI over real HTTP)
node --test "tests/js/*.test.mjs"   # 50 tests for the browser tool libraries (Node 22), incl. RFC test vectors
# browser end-to-end suites (Playwright): see tests/e2e/*.cjs
```

Layout:

```
hitchly/
  domain.py    pure rules: validation, slug generation, errors   (no I/O)
  storage.py   SQLite repository — the only place with SQL
  service.py   use-cases; injectable clock for deterministic tests
  web.py       HTTP adapter: routing, auth, JSON, security headers
  ratelimit.py sliding-window limiter (failed-auth lockout)
  config.py    env-var configuration
  probe.py     SSRF-guarded URL probing (redirect tracer, dead-link checker)
  qr.py        QR encoder (the browser has an identical JS port)
  ui/          web UI: app shell, one ES module per tool (tools/), pure logic (lib/); no build step
hitchly_client/ Python SDK over the HTTP API
hitchctl/     CLI built on the SDK
deploy/        Prometheus config; Dockerfile + docker-compose.yml at the root
tests/         unit + integration tests
docs/          product brief, architecture, ADRs
```

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Problem, users, stories, roadmap |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, flows, data model, security, ADR index |
| [docs/API.md](docs/API.md) | Full endpoint reference |
| [docs/ECOSYSTEM.md](docs/ECOSYSTEM.md) | How server, SDK, CLI and ops tools fit together |
| [docs/HOSTING.md](docs/HOSTING.md) | Free hosting options (static toolbox on Pages; server on a Pi/Oracle/tunnel) and free testing |
| [docs/STACK-REVIEW.md](docs/STACK-REVIEW.md) | Measured stack review: what we fixed, limits, alternatives (Go, Node/TS, Workers + D1) and a recommendation |
| [docs/TOOL-IDEAS.md](docs/TOOL-IDEAS.md) | Researched backlog: more tools and use cases, with priorities and what we won't build |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) | Bookmarklet, shell, CI, cron, share-sheet recipes |
| [docs/COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md) | How we compare to Shlink, YOURLS, Kutt, Dub… and why |
| [docs/CLI.md](docs/CLI.md) · [docs/SDK.md](docs/SDK.md) | `hitch` and Python client |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | systemd, Docker, nginx, backups |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Ground rules, commit style, releasing |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
