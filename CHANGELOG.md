# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [Unreleased]
### Changed
- `clicks` / `total_clicks` / `hitchly_clicks_total` now exclude bots (previously every redirect counted).
- **Renamed the product from Linkly to Hitchly** (a hitch is a knot that ties things together). Pre-release, so there is no compatibility layer:
  package `shortener` → `hitchly`, `linkly_client` → `hitchly_client`, `linklyctl` → `hitchctl` (command `hitch`),
  server command `linkly` → `hitchly`, env vars `LINKLY_*` → `HITCHLY_*`, default DB `linkly.db` → `hitchly.db`,
  metrics `linkly_*` → `hitchly_*`.

### Added
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
