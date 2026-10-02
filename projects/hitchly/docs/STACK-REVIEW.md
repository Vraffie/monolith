# Stack review: can it be done differently?

Date: 2026-10-01. Method: we **measured** the current stack under load, **audited** the UI, **built a spike** for the most promising alternative, and researched the rest.
Evidence is labelled: *measured* (we ran it), *tested* (we built it and it passed), *sourced* (from a web page, linked), *judgement* (my opinion).
Benchmarks ran in a 4-vCPU sandbox with the load generator on the same machine, so absolute numbers are conservative and relative changes are what matter.

## Verdict
**Keep the stack. Don't rewrite.** Python standard library + SQLite + vanilla ES modules is the right shape for a one-process, no-dependency tool. The review found **five concrete
defects in how we used it** (all fixed, with tests) and one **strategic option** worth keeping open: a JavaScript/TypeScript core that could also run free on Cloudflare Workers.

## 1. The current stack
| Layer | Choice | Why it fits |
|-------|--------|-------------|
| Server | Python 3.10+ stdlib `http.server`, thread per connection | zero dependencies, readable, easy to audit |
| Storage | SQLite (WAL), one file | backup = one command, no database server |
| UI | Vanilla ES modules, no build step, strict CSP | 0 npm dependencies at runtime, testable with Node and Playwright |
| Clients | Python SDK + CLI over the public API | one contract (ADR 0004) |

## 2. What we found and fixed (all *measured*)
| # | Finding | Evidence | Fix |
|---|---------|----------|-----|
| 1 | Every response with a body stalled ~43 ms (Nagle + delayed ACK) | `/health`, 1 connection: 23 req/s, p50 43 ms → **6,864 req/s, p50 < 1 ms** | headers+body in one buffered write, Nagle off |
| 2 | Listen backlog of 5 dropped connections under bursts | max latency 1-8 s at 200 connections | backlog 512, 512-thread cap |
| 3 | A SQLite connection opened per query, default journal | redirects 357 → 776 req/s at 1 connection | one reused connection per thread, WAL, in-process click lock |
| 4 | **Redirect lookup was O(clicks)**: it counted the link's clicks on every visit | 24 ms at 100k clicks, 164 ms at 500k → **0.014 ms** | counters on the `links` row, same transaction as the click (migration backfills) |
| 5 | UI first load: opening *Base64* fetched all 22 tools, uncompressed | 46 requests / 102 KB → **9 requests / 10 KB** | lazy `import()` per tool + gzip (105 KB → 32 KB over the wire) |

Net effect on the redirect hot path: **198 → 1,689 req/s at 200 connections, p99 4.0 s → 0.34 s**, memory 81 MB. Details and the full table: [ADR 0005](adr/0005-sqlite-counters-wal-and-server-limits.md).

Usability audit (axe-core, 22 tools × light/dark, mobile overflow, screenshots) found and fixed: a mobile tool list that clipped most tools, a squeezed search box, a red error shown before any input,
an unlabelled input (the only axe violation) and mis-rendered colour pickers. Now 0 violations, 0 overflow, enforced in CI.

## 3. Limits that remain (*measured*)
- **Slow-client resilience.** Thread-per-connection survived 300 stalled clients with no impact but **stopped answering at 600** until its 10 s timeout reaped them. A reverse proxy
  (nginx, Caddy, Cloudflare Tunnel) removes this class of problem and is **required** for the open internet. An async server would absorb it natively.
- **Redirect throughput is capped near 1.7-2.9k req/s** by Python's GIL and per-click SQLite writes. That is roughly 150M redirects/day: far beyond a self-hosted shortener's needs.
- **One process owns the database.** Multi-process or multi-node needs a different design (below).
- **Per-link reports** (`top_referrers`) still scan that link's click history. They are on-demand admin queries, not the redirect path.
- The click log grows without bound (no retention policy yet): ~100 bytes per click, so 1M clicks ≈ 100 MB. A retention/rollup setting is a sensible future feature.

## 4. Alternatives
| Option | Pros | Cons / risks | Evidence |
|--------|------|--------------|----------|
| **A. Stay: Python stdlib (hardened)** | Works, 117 Python tests, zero deps, fast enough | Not slow-client proof alone; Python required (or Docker) | *measured* |
| **B. Go, single static binary** | One file to download; goroutines are cheap (≈4 KB), so slow clients are a non-issue; ~10-30 MB idle; pure-Go SQLite (`modernc.org/sqlite`) avoids CGO | **Full rewrite** (~all server code, the QR encoder, scrypt via `x/crypto`, the SDK/CLI stay Python or are rewritten); can't share code with the browser; our 117 tests rewritten | *sourced*: [language comparison](https://hemaks.org/posts/comparing-web-server-performance-go-vs-nodejs-vs-python/), [modernc pure-Go SQLite](https://til.andrew-quinn.me/posts/you-don-t-need-cgo-to-use-sqlite-in-your-go-binary/); generic benchmarks, not ours |
| **C. Node 22+/TypeScript, built-ins only** | **One language server + browser**: the QR encoder, slug/URL rules and bot rules exist once; `node:sqlite` is built in (release candidate since 24.15), `crypto.scrypt` is built in; async I/O absorbs slow clients | Rewrite; `node:sqlite` is synchronous, so a slow query blocks the event loop ([source](https://daily.dev/posts/node-sqlite-sqlite-built-into-node-js-wiujo9t6g)); Node must be installed (or Docker) | *sourced* + the JS-reuse half is *tested* by the spike |
| **D. Cloudflare Workers + D1** | **Free and persistent**; global edge; no server to run. The rival Sink runs this way (D1 as the store, KV as a cache) ([source](https://github.com/miantiao-me/Sink)) | Platform limits (below); vendor lock-in; password hashing and the SSRF-guarded probes need redesign; no long-running process | *tested*: spike passes 4/4 in `workerd` |
| E. Bun / Deno | Built-in SQLite, fast | Smaller install base, another runtime to ask users for; no compelling gain over C | *sourced* |
| F. FastAPI/Django + Postgres, or Next.js + serverless DB | Mature ecosystems | Adds dependencies and a database server; abandons the "one file, zero deps" promise | *judgement* |
| G. Frontend framework (Preact, Svelte, Vue) | Less hand-written DOM code | Build step and dependency tree; the vanilla UI is accessible (axe 0), small (32 KB gzipped for all 22 tools) and CSP-strict. No pain that justifies it | *measured* + *judgement* |

### What the Workers spike showed (*tested*)
`experiments/workers-spike/` runs create, validation, redirect, expiry, max visits, human/bot counters and QR generation in the real Workers runtime via Miniflare: **4/4 pass**.
The core is ~110 lines, and **the browser's own `lib/qr.js` is imported unchanged**. That is the headline: a JavaScript core removes the duplicate QR implementation and the cross-language test.

**Not tested** (Miniflare enforces none of these): quoted free-plan limits are 100,000 requests/day and 10 ms CPU per request ([source](https://eastondev.com/blog/en/posts/dev/20260526-cloudflare-free-limits/)), and D1 free gives 5 GB storage,
5M rows read/day and 100,000 rows written/day ([source](https://freetier.co/articles/cloudflare-d1-free-tier-limits-pricing-and-alternatives)). A tracked redirect writes two rows in our design (counter update + click row), so
the free write quota would cap *tracked* redirects at roughly 50k/day (*my arithmetic from the quoted limits, not a measurement*); one search result suggested the D1 free tier was recently capped, which we could not verify. The 10 ms CPU limit
makes scrypt-style password hashing a risk, and we did not measure PBKDF2 in Workers.

## 5. Recommendation
1. **Now: stay on Python.** Done: five fixes above, tests, ADR 0005, usability fixes, CI audit.
2. **If "free persistent hosting" or "one language" becomes a priority:** promote the spike into a **TypeScript core with two adapters** (Node + `node:sqlite` for self-hosting, Workers + D1 for free edge hosting), keeping the Python server as the reference until the TS version passes the same API tests. Prerequisite: turn the Python API tests into a language-neutral conformance suite (HTTP-level; most of `tests/test_api.py` already is). Estimated effort is large (a rewrite of ~3k lines plus tests): *judgement*.
3. **Go only if** "download one binary" matters more than sharing code with the browser. We would not choose it for this product.
4. **Don't** adopt a frontend framework, Postgres, or another runtime without a measured problem.

## 6. Which of our tools are strongest
No usage data exists, so this ranks by *evidence we have*: appears in IT-Tools/DevToys/CyberChef (commodity) vs. unique to us, passes the usability audit, and has independent verification.

| Tier | Tools | Why |
|------|-------|-----|
| **Differentiators** | Short links (counters, bot filter, password, max visits), **QR generator** (browser-side; decoded back by an independent decoder), **Redirect tracer** (SSRF-guarded; not in the toolboxes we surveyed), UTM builder + bulk/import/export/dead-link checker (the link workflow) | rivals either lack them or split them across products |
| **Strong commodity** | JWT decoder (honest about not verifying), Regex tester (runaway patterns are killed), Password/token generator (unbiased sampling), Hash/HMAC (RFC vectors), JSON formatter | well-tested, privacy-preserving, match what established toolboxes offer |
| **Solid utilities** | Base64, URL encode/decode, UUID v4/v7, Timestamp, Colour + contrast, Text/slug, Base converter, URL parser/cleaner | correct and accessible, but interchangeable with other sites |
| **Gaps** | text diff, cron, format converters, status-code reference, TOTP, subnet calculator, image tools | see [TOOL-IDEAS.md](TOOL-IDEAS.md) and issues #15-#21 |
