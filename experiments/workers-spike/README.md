# Spike: Hitchly's core on Cloudflare Workers + D1

**Question:** can the product run on a free, persistent edge platform, and how much would it cost to get there? (See `docs/STACK-REVIEW.md`.)

**Answer from this spike:** yes for the core. About 110 lines implement create, redirect, expiry, max visits, bot-aware O(1) counters (same atomic conditional
`UPDATE` as the Python version) and QR codes, and they pass 4 tests in the real Workers runtime (`workerd`, via Miniflare).
The QR encoder is **the same file the browser UI uses** (`hitchly/ui/lib/qr.js`), imported unchanged; there is no second implementation.

```bash
cd experiments/workers-spike && npm install && npm test
```

**What this does NOT prove** (not tested, because Miniflare enforces none of Cloudflare's platform limits):
- Free-plan CPU limit (10 ms) vs. password hashing: scrypt is not available in Workers; PBKDF2 via WebCrypto would be needed, and its CPU cost there is unmeasured.
- Free-plan request and D1 write quotas (see STACK-REVIEW for the quoted figures) under real traffic.
- Missing from the spike: tags, passwords, UI hosting, the tracer/checker (Workers `fetch` has different SSRF properties), import/export, backup (D1 has its own export tooling).

Not part of the product build or CI (it needs `npm install`).
