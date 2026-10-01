# The Linkly ecosystem

Linkly started as a server. It is now a small set of tools that all talk to the same public HTTP API.

```
                         ┌──────────────┐
   browser ─────────────▶│              │
   web UI (ui.html)      │              │      ┌─────────┐
                         │   shortener  │─────▶│ SQLite  │◀── python -m shortener backup / purge
   linklyctl ──▶ linkly_ │   (server)   │      └─────────┘
   (CLI)         client ▶│              │
   your scripts ─▶ (SDK) │              │──/metrics──▶ Prometheus
                         └──────────────┘
                              ▲
                      visitors: GET /{slug} → 302
```

| Component | Path | For | Docs |
|-----------|------|-----|------|
| **Server** | `shortener/` | Running the service | [README](../README.md), [API](API.md) |
| **Python SDK** | `linkly_client/` | Integrating from code | [SDK.md](SDK.md) |
| **CLI** | `linklyctl/` | Shell, scripts, cron, migrations | [CLI.md](CLI.md) |
| **Web UI** | `shortener/ui.html` | Occasional manual use | — |
| **Ops commands** | `python -m shortener purge\|backup` | Maintenance on the server host | [DEPLOYMENT.md](DEPLOYMENT.md) |
| **Observability** | `/metrics`, `deploy/prometheus.yml` | Monitoring | [DEPLOYMENT.md](DEPLOYMENT.md) |
| **Packaging / CI** | `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml` | Shipping | [DEPLOYMENT.md](DEPLOYMENT.md) |

## Design rules for the ecosystem
1. **The HTTP API is the only integration surface.** The SDK and CLI never touch the database or import `shortener`,
   so they work against any Linkly server, local or remote, of the same major version. (Only the ops commands run on the server host.)
2. **Same dependency policy everywhere:** standard library only (ADR 0001, 0004).
3. **Dependency direction:** `linklyctl → linkly_client → HTTP → shortener`. Tests are the one place that
   imports both sides, to run them end-to-end in-process.
4. **One version, one changelog.** All components ship together from one package and share a version number.

## How the tools combine
- **Migration:** `linklyctl export` on the old server, `linklyctl import --skip-existing` on the new one.
- **Hygiene:** cron `linklyctl check` (dead targets) and `python -m shortener purge` (expired links).
- **Disaster recovery:** nightly `python -m shortener backup`; restore = copy the file back.
- **Automation:** CI pipelines create a short link per release with the SDK or `linklyctl new --ttl 30d`.
- **Alerting:** Prometheus scrapes `/metrics`; alert on `linkly_links_expired` or a flat `linkly_clicks_total`.

## Not (yet) in the ecosystem
Web UI editing and bulk actions, QR codes, webhooks on click, multiple API tokens/scopes,
SDKs for other languages (the API is small and documented — see [API.md](API.md)).
