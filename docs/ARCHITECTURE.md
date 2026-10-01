# Architecture

A **modular monolith**: one deployable process with strict internal layering.

```
 browser / curl ──▶ web.py ──▶ service.py ──▶ storage.py ──▶ SQLite
                      │            │
                      │            └──▶ domain.py (pure rules)
                      └─ auth, routing, JSON, headers
```

Dependencies point inward only: `web → service → (domain, storage)`;
`storage → domain` (for types/errors). `domain` imports nothing from the project.
The service takes a clock and a storage instance, so tests need no mocking
frameworks — they use an in-memory DB and a fake clock.

## Beyond the server
The SDK (`hitchly_client`) and CLI (`hitch`) sit outside this layering and consume only the HTTP API
(see [ECOSYSTEM.md](ECOSYSTEM.md) and ADR 0004). `ratelimit.py` is an in-process helper used by `web.py`.

## Key flows
- **Create**: validate (domain) → insert; random slug retried on collision (widening length).
- **Redirect**: lookup → if expired, 410 → record click → `302` with `Cache-Control: no-store`
  (302, not 301, so every visit is counted).
- **Stats**: aggregate clicks with `date(ts,'unixepoch')` grouping over the `(link_id, ts)` index.

## Data model
`links(id, slug UNIQUE, url, created_at, expires_at)` and
`clicks(id, link_id → links ON DELETE CASCADE, ts, referrer, user_agent, is_bot)`.
The schema is versioned with `PRAGMA user_version` and evolved by the append-only `MIGRATIONS` list in `storage.py` (never edit a released step).

## Security
- **Server-side URL probing (tracer, dead-link checker) is an SSRF surface.** `hitchly/probe.py` allows only http/https and ports
  80/443/8080/8443, rejects credentials in URLs, resolves the host itself and refuses private, loopback, link-local, multicast, reserved,
  carrier-grade-NAT and embedded-IPv4 (mapped/6to4/NAT64) addresses, rejects a host if *any* answer is blocked, then connects to the
  **validated IP** (so DNS rebinding cannot swap it afterwards), validates every redirect hop again and never follows redirects blindly.
  It sends no cookies or credentials and caps time, hops and bytes. Opt out with `HITCHLY_PROBE_ALLOW_PRIVATE=1` only on a trusted LAN.
  Probes are token-gated and rate limited (`HITCHLY_PROBE_LIMIT`).
- Link passwords: salted scrypt (stdlib), constant-time verification, never serialised (`Link.password_hash` is excluded from `repr`), attempts rate limited per client+slug.
- Bearer token compared with `hmac.compare_digest`; random token generated if unset.
- Only `http`/`https` targets (blocks `javascript:`/`data:`), length and whitespace checks.
- Body capped at 8 KiB; unread bodies close the connection (avoids request smuggling-style desync).
- UI served with a CSP, `nosniff`, `Referrer-Policy: no-referrer`; UI renders data with `textContent` only (no XSS sinks).
- Parameterised SQL throughout.
- Failed auth attempts are rate limited per client (in memory; resets on restart). Other endpoints are not rate limited — use the proxy.
- CSV export neutralises spreadsheet formulas in attacker-controlled fields.
- Known limits: token stored in `localStorage` by the UI; run behind a TLS proxy.

## Decisions (ADRs)
- [0001 Standard library only](adr/0001-stdlib-only.md)
- [0002 SQLite for storage](adr/0002-sqlite.md)
- [0003 Single shared bearer token](adr/0003-single-token.md)
- [0004 Clients use only the public API](adr/0004-clients-use-public-api.md)

## Scaling notes
SQLite in WAL-capable mode handles thousands of redirects/s on one box. If you outgrow it,
only `storage.py` needs a new implementation (Postgres) and click writes could be batched
or queued — the service interface stays the same.
