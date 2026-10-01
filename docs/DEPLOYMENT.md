# Deployment guide

Linkly is a single process plus a SQLite file. It speaks plain HTTP and is not
hardened for direct internet exposure: **put a TLS-terminating reverse proxy in front.**

## Checklist
- [ ] Set `LINKLY_TOKEN` to a long random value (`python3 -c "import secrets;print(secrets.token_urlsafe(32))"`)
- [ ] Set `LINKLY_BASE_URL` to the public origin (e.g. `https://go.example.com`)
- [ ] Bind to localhost (`LINKLY_HOST=127.0.0.1`) when a proxy runs on the same host
- [ ] Put `LINKLY_DB` on persistent storage and back it up
- [ ] Schedule `purge` (optional)

## Extra settings
| Variable | Default | Notes |
|----------|---------|-------|
| `LINKLY_AUTH_FAIL_LIMIT` | `10` | Failed token attempts per client per minute before `429` |
| `LINKLY_TRUST_PROXY` | off | Set to `1` **only** behind a proxy that overwrites `X-Forwarded-For`; otherwise every client appears as the proxy and shares one lockout bucket |

With nginx add `proxy_set_header X-Forwarded-For $remote_addr;` (overwrite, don't append) and set `LINKLY_TRUST_PROXY=1`.

## systemd
`/etc/systemd/system/linkly.service`
```ini
[Unit]
Description=Linkly URL shortener
After=network.target

[Service]
WorkingDirectory=/opt/linkly
Environment=LINKLY_DB=/var/lib/linkly/linkly.db
Environment=LINKLY_BASE_URL=https://go.example.com
EnvironmentFile=/etc/linkly.env          # contains LINKLY_TOKEN=...
ExecStart=/usr/bin/python3 -m shortener serve
DynamicUser=yes
StateDirectory=linkly
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Docker
```bash
docker build -t linkly .
docker run -d -p 127.0.0.1:8080:8080 -v linkly-data:/data \
  -e LINKLY_TOKEN=change-me -e LINKLY_BASE_URL=https://go.example.com linkly
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
Add `limit_req` here if you need rate limiting; Linkly has none built in.

## Operations
- **Backup:** `python3 -m shortener backup /backups/linkly-$(date +%F).db` (consistent copy while running; uses `LINKLY_DB`).
- **Purge expired links:** `python3 -m shortener purge`, e.g. cron `0 3 * * * cd /opt/linkly && python3 -m shortener purge`.
  Expired links already return 410 without purging; purging only reclaims space.
- **Upgrade:** replace the code and restart; the schema is created idempotently on startup.
- **Logs:** one access-log line per request on stdout.
- **Rotating the token:** change `LINKLY_TOKEN` and restart (UI users must sign in again).

## Monitoring
`GET /metrics` (token required) exposes `linkly_links`, `linkly_links_expired`, `linkly_clicks_total`.
`docker-compose.yml` ships an optional Prometheus profile preconfigured to scrape it:
`docker compose --profile monitoring up -d`. Alert on `linkly_links_expired` growing if you rely on `purge`.
