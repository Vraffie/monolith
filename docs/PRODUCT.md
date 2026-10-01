# Product brief

## Problem
Teams and individuals want short, memorable, trackable links without sending
their data to a SaaS or running a heavy stack (DB server, queue, framework).

## Target user
A single owner/small team self-hosting on a VPS, Raspberry Pi or container.
Not (yet) a multi-tenant public service.

## Goals
1. Install-and-run in under a minute, no dependencies.
2. Create a link in two clicks or one `curl`.
3. See whether a link is being used.

## Non-goals (v1)
Multi-user accounts, link editing, QR codes, geo/device analytics, public sign-up.

## User stories & acceptance
| # | Story | Acceptance |
|---|-------|-----------|
| 1 | As an owner I shorten a URL | valid http(s) URL → 201 with `short_url`; other schemes rejected |
| 2 | I pick a custom slug | 3–32 chars `[A-Za-z0-9_-]`; reserved/dup → 400/409 |
| 3 | I set a link to expire | after TTL, visitors get 410 and clicks are not counted |
| 4 | I see click analytics | total, per-day for N days, top referrers |
| 5 | I delete a link | link and its click history removed; later visits 404 |
| 6 | Only I can manage links | all `/api` routes need the token; redirects are public |
| 7 | I clean up | `python -m shortener purge` removes expired links |
| 8 | I fix a link without changing its URL | `PATCH` changes target/expiry; slug and click history preserved |
| 9 | I automate and migrate | SDK + `linklyctl`: create, bulk import/export, dead-link check; exit codes usable in cron/CI |
| 10 | I monitor and recover | `/metrics` for Prometheus; online `backup` produces a consistent copy |
| 11 | Guessing the token is impractical | repeated failures lock the client out (429) |

## Success metrics
Time-to-first-link < 60 s; redirect path adds one indexed read and one insert.

## Roadmap
Shipped in 1.1: link editing, bulk import/export, CSV clicks, metrics, auth lockout, SDK, CLI.
Next: QR codes, UI editing, click webhooks, multiple scoped API tokens, general rate limiting.
