# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [Unreleased]
### Changed
- **Performance:** removed a ~43 ms stall on every response with a body, raised the listen backlog, reuse one SQLite connection per thread with WAL, and made visit counters O(1) (a redirect on a link with 500,000 clicks took 164 ms; now 0.014 ms). Redirects ~8x faster under concurrency. ADR 0005.
- Server limits: 10 s socket timeout and a 512-thread cap. Database schema migration 5 adds per-link counters (automatic).
- `clicks` / `total_clicks` / `hitchly_clicks_total` now exclude bots (previously every redirect counted).
- **Renamed the product from Linkly to Hitchly** (a hitch is a knot that ties things together). Pre-release, so there is no compatibility layer:
  package `shortener` → `hitchly`, `linkly_client` → `hitchly_client`, `linklyctl` → `hitchctl` (command `hitch`),
  server command `linkly` → `hitchly`, env vars `LINKLY_*` → `HITCHLY_*`, default DB `linkly.db` → `hitchly.db`,
  metrics `linkly_*` → `hitchly_*`.

### Added
- **Toolbox batch 1 (15 new tools, 37 in total):** Text & JSON diff, Cron explainer, JSON/YAML/XML/CSV converter, HTTP status & MIME reference, TOTP (2FA) codes with QR, Subnet calculator (IPv4/IPv6, range → CIDR),
  Lorem ipsum, chmod calculator, Escape & unescape, Text ⇄ bytes/Unicode/NATO, Unit/percentage/Roman converters, IBAN validator & email normaliser, Basic auth header, RSA/ECDSA/Ed25519 key pairs,
  passphrase text encryption (PBKDF2 → AES-GCM); ULID added to the UUID tool. New group "Network & web". Verified against RFC 4226/6238/7617 vectors, a Myers-diff minimality reference, YAML round-trip
  property tests, IBAN registry examples; the YAML reader refuses anchors/tags/merge keys/multi-document input instead of guessing.
- Static deployment: the toolbox works without a server (`.github/workflows/pages.yml` publishes it to GitHub Pages; the UI detects the missing server). `docs/HOSTING.md` compares free hosting options.
- Bulk create (`POST /api/links/bulk`), overview, purge and backup endpoints; admin tools in the UI (import with column mapping, export, bulk shorten, maintenance); `hitch overview/purge/backup`.
- Web UI is now a modular toolbox: Short links, QR generator (Wi-Fi, vCard, email, SMS, phone, location; generated in the browser), redirect tracer, UTM builder, URL parser/cleaner, Base64, URL encode/decode, JWT decoder, hash/HMAC, UUID, password/token generator, JSON formatter, timestamp converter, colour + contrast, regex tester, text utilities, base converter, dead-link checker. Client-side tools work without signing in.
- `POST /api/tools/trace` and `POST /api/links/check` (server-side probing with SSRF protection); SDK `trace`/`check_links`; `hitch trace`.
- Stricter CSP: no inline scripts or styles.
- UI bookmarklet and `#new=<url>` prefill; `docs/INTEGRATIONS.md` recipes.
- `hitch import` column mapping (`--url-col`, `--slug-col`, `--delimiter`, `--slug-last-segment`, `--default-tag`) and `--dry-run`; tolerates a UTF-8 BOM.
- Password-protected links: salted-scrypt storage, no-JS form, 303 on success, no click until verified, per-client lockout. CLI `--ask-password`/`--password-env`/`--no-password`; UI password field.
- Max visits: `max_visits` caps human visits (410 afterwards), atomic under concurrency; CLI `--max-visits`/`--no-max-visits`.
- Tags and search: `tags` on create/PATCH, `tag`/`q` filters on list, `hitch --tag/--search`, UI search (`#tag` or text) and tag field; CSV export/import include tags.
- Bot filtering: clicks are classified by User-Agent; `clicks` counts humans, `bot_clicks` separately; `include_bots` on stats; `bot` column in CSV; `hitchly_bot_clicks_total` metric. Migration backfills history.
- Versioned schema migrations (`PRAGMA user_version`); old 1.x databases upgrade in place.
- QR codes: `GET /api/links/{slug}/qr.svg`, `hitch qr`, SDK `qr_svg`, UI button. In-repo stdlib encoder (`hitchly/qr.py`), verified against zxing-cpp for versions 1-40.
- Web UI: edit a link's destination and expiry.
- Rate limit on link creation (`LINKLY_CREATE_LIMIT`, default 60/min per client).

## [1.1.0] - 2026-10-01
### Added
- `PATCH /api/links/{slug}` to edit target and expiry.
- `GET /api/links/{slug}/clicks.csv` raw click export (formula-injection safe).
- `GET /metrics` (Prometheus) and `python -m shortener backup <file>`.
- Brute-force protection: per-client lockout after failed auth (`LINKLY_AUTH_FAIL_LIMIT`, `LINKLY_TRUST_PROXY`).
- `linkly_client` Python SDK and `linklyctl` CLI (new/ls/get/edit/rm/stats/clicks/export/import/check).
- GitHub Actions CI, `docker-compose.yml` with optional Prometheus profile.
- Docs: CLI, SDK, ecosystem overview.

### Changed
- `metrics` is now a reserved slug.

## [1.0.0] - 2026-10-01
### Added
- Link shortening with random or custom slugs and optional expiry.
- Click analytics (total, per day, top referrers).
- Token-protected JSON API and single-file web UI.
- `purge` command, Dockerfile, `linkly` console script.
- Documentation: product brief, architecture, ADRs, API reference, deployment guide.

### Fixed
- Unread request bodies (oversized or unauthorised POSTs) could be misparsed as the next request on a keep-alive connection.
