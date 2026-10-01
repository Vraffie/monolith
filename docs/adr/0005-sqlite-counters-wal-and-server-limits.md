# ADR 0005: Visit counters, WAL with per-thread connections, and server limits
**Status:** accepted (2026-10-01)

**Context.** A stack review benchmarked the server (4 vCPU sandbox, autocannon on the same machine, so absolute numbers are conservative) and found three
defects in how we used the stack, not limits of it:
1. Every response with a body stalled ~43 ms (Nagle + delayed ACK: headers and body were written separately).
2. The listen backlog was the stdlib default of 5: bursts dropped connections, producing 1-8 s max latencies.
3. Every query opened a SQLite connection (rollback journal), and every redirect counted the link's clicks with a subquery: **O(clicks)**,
   measured at 24 ms per lookup with 100,000 clicks on a link and 164 ms with 500,000.

**Decision.**
- Write headers and body in one buffered flush; disable Nagle; listen backlog 512; cap concurrent threads (512); socket timeout 10 s.
- One SQLite connection per thread, reused; WAL journal; `synchronous=NORMAL`; 0.5 MiB cache per connection; WAL size limit 16 MiB.
- Click writes serialised by an in-process lock (cheaper than SQLite's sleep-and-retry busy handler under contention).
- Denormalised counters `links.clicks` / `links.bot_clicks`, updated in the same transaction as the click row (migration 5 backfills). The visit cap is now one
  conditional `UPDATE ... WHERE clicks < max_visits`, still atomic.

**Results (same machine, same benchmark, before → after).**

| Scenario | Before | After |
|----------|--------|-------|
| `/health`, 1 connection | 23 req/s, p50 43 ms | 6,864 req/s, p50 < 1 ms |
| Redirect + click insert, 1 conn | 357 req/s | 2,930 req/s |
| Redirect, 200 conns | 198 req/s, p99 4.0 s, max 5.6 s | 1,689 req/s, p99 0.34 s, max 0.41 s |
| Links API list (50 rows), 50 conns | 413 req/s, p99 183 ms | 1,353 req/s, p99 64 ms |
| Lookup of a link with 500,000 clicks | 164 ms | 0.014 ms |
| Memory after load | 63 MB (but 262 MB mid-fix with per-thread caches) | 81 MB |

**Consequences / limits we measured and accept.**
- WAL mode creates `-wal` and `-shm` files next to the database: **copy it only with `hitchly backup`**, never with `cp` while running.
- `synchronous=NORMAL`: after a power cut the last transactions may be lost; the database stays consistent. A crash of the app loses nothing.
- Thread-per-connection is not slow-client proof: with 600 connections stalled mid-request the server stops answering until the timeout reaps them
  (300 stalled were absorbed with no impact). **Run it behind a reverse proxy** (nginx, Caddy, Cloudflare Tunnel), which buffers slow clients. An async server would fix this
  at the cost of writing our own HTTP layer; see docs/STACK-REVIEW.md.
- Reports that scan a link's full click history (`top_referrers`) are still O(clicks) for that link. They are on-demand admin queries, not the redirect path.
- A single process owns the database. Running several server processes on one file is unsupported.
