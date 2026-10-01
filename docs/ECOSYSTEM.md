# The Hitchly ecosystem

Hitchly started as a server. It is now a small set of tools that all talk to the same public HTTP API.

```
                         ┌──────────────┐
   browser ─────────────▶│              │
   web UI (ui.html)      │              │      ┌─────────┐
                         │   hitchly  │─────▶│ SQLite  │◀── python -m hitchly backup / purge
   hitch ──▶ hitchly_ │   (server)   │      └─────────┘
   (CLI)         client ▶│              │
   your scripts ─▶ (SDK) │              │──/metrics──▶ Prometheus
                         └──────────────┘
                              ▲
                      visitors: GET /{slug} → 302
```

| Component | Path | For | Docs |
|-----------|------|-----|------|
| **Server** | `hitchly/` | Running the service | [README](../README.md), [API](API.md) |
| **Python SDK** | `hitchly_client/` | Integrating from code | [SDK.md](SDK.md) |
| **CLI** | `hitchctl/` | Shell, scripts, cron, migrations | [CLI.md](CLI.md) |
| **Web UI** | `hitchly/ui.html` | Occasional manual use | — |
| **Ops commands** | `python -m hitchly purge\|backup` | Maintenance on the server host | [DEPLOYMENT.md](DEPLOYMENT.md) |
| **Observability** | `/metrics`, `deploy/prometheus.yml` | Monitoring | [DEPLOYMENT.md](DEPLOYMENT.md) |
| **Packaging / CI** | `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml` | Shipping | [DEPLOYMENT.md](DEPLOYMENT.md) |

## Design rules for the ecosystem
1. **The HTTP API is the only integration surface.** The SDK and CLI never touch the database or import `hitchly`,
   so they work against any Hitchly server, local or remote, of the same major version. (Only the ops commands run on the server host.)
2. **Same dependency policy everywhere:** standard library only (ADR 0001, 0004).
3. **Dependency direction:** `hitch → hitchly_client → HTTP → hitchly`. Tests are the one place that
   imports both sides, to run them end-to-end in-process.
4. **One version, one changelog.** All components ship together from one package and share a version number.

## How the tools combine
- **Migration:** `hitch export` on the old server, `hitch import --skip-existing` on the new one.
- **Hygiene:** cron `hitch check` (dead targets) and `python -m hitchly purge` (expired links).
- **Disaster recovery:** nightly `python -m hitchly backup`; restore = copy the file back.
- **Automation:** CI pipelines create a short link per release with the SDK or `hitch new --ttl 30d`.
- **Alerting:** Prometheus scrapes `/metrics`; alert on `hitchly_links_expired` or a flat `hitchly_clicks_total`.

## Not (yet) in the ecosystem
Web UI bulk actions, QR codes, webhooks on click, multiple API tokens/scopes,
SDKs for other languages (the API is small and documented — see [API.md](API.md)).
