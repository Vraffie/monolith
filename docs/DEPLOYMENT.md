# Deployment guide

Hitchly is a single process plus a SQLite file. It speaks plain HTTP and is not
hardened for direct internet exposure: **put a TLS-terminating reverse proxy in front.**

## Checklist
- [ ] Set `HITCHLY_TOKEN` to a long random value (`python3 -c "import secrets;print(secrets.token_urlsafe(32))"`)
- [ ] Set `HITCHLY_BASE_URL` to the public origin (e.g. `https://go.example.com`)
- [ ] Bind to localhost (`HITCHLY_HOST=127.0.0.1`) when a proxy runs on the same host
- [ ] Put `HITCHLY_DB` on persistent storage and back it up
- [ ] Schedule `purge` (optional)

## Extra settings
| Variable | Default | Notes |
|----------|---------|-------|
| `HITCHLY_AUTH_FAIL_LIMIT` | `10` | Failed token attempts per client per minute before `429` |
| `HITCHLY_CREATE_LIMIT` | `60` | Links created per client per minute before `429`; `0` disables |
| `HITCHLY_TRUST_PROXY` | off | Set to `1` **only** behind a proxy that overwrites `X-Forwarded-For`; otherwise every client appears as the proxy and shares one lockout bucket |

With nginx add `proxy_set_header X-Forwarded-For $remote_addr;` (overwrite, don't append) and set `HITCHLY_TRUST_PROXY=1`.

## systemd
`/etc/systemd/system/hitchly.service`
```ini
[Unit]
Description=Hitchly URL shortener
After=network.target

[Service]
WorkingDirectory=/opt/hitchly
Environment=HITCHLY_DB=/var/lib/hitchly/hitchly.db
Environment=HITCHLY_BASE_URL=https://go.example.com
EnvironmentFile=/etc/hitchly.env          # contains HITCHLY_TOKEN=...
ExecStart=/usr/bin/python3 -m hitchly serve
DynamicUser=yes
StateDirectory=hitchly
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Docker
```bash
docker build -t hitchly .
docker run -d -p 127.0.0.1:8080:8080 -v hitchly-data:/data \
  -e HITCHLY_TOKEN=change-me -e HITCHLY_BASE_URL=https://go.example.com hitchly
```

## Reverse proxy (nginx)
```nginx
server {
  listen 443 ssl;
  server_name go.example.com;
  # ssl_certificate ...;
  client_max_body_size 16k;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
  }
}
```
Add `limit_req` here if you need rate limiting; Hitchly has none built in.

## Operations
- **Backup:** `python3 -m hitchly backup /backups/hitchly-$(date +%F).db` (consistent copy while running; uses `HITCHLY_DB`).
- **Purge expired links:** `python3 -m hitchly purge`, e.g. cron `0 3 * * * cd /opt/hitchly && python3 -m hitchly purge`.
  Expired links already return 410 without purging; purging only reclaims space.
- **Upgrade:** replace the code and restart; the schema is created idempotently on startup.
- **Logs:** one access-log line per request on stdout.
- **Rotating the token:** change `HITCHLY_TOKEN` and restart (UI users must sign in again).

## Monitoring
`GET /metrics` (token required) exposes `hitchly_links`, `hitchly_links_expired`, `hitchly_clicks_total`.
`docker-compose.yml` ships an optional Prometheus profile preconfigured to scrape it:
`docker compose --profile monitoring up -d`. Alert on `hitchly_links_expired` growing if you rely on `purge`.
