# Competitive analysis

Researched 2026-10-01. Evidence: the projects' GitHub READMEs (Kutt, Shlink, Dub, Sink, YOURLS) and
web search summaries of vendor comparison pages (Bitly, Rebrandly, Short.io). Several sites (shlink.io,
yourls.org) were unreachable from the research sandbox, so Shlink/YOURLS details come from their READMEs and
third-party summaries and may be incomplete. Vendor-authored comparison pages are marketing: treat them as
claims, not measurements. Nothing here was benchmarked.

## Who we compete with

| Rival | Type | Stack / footprint | Where it wins |
|-------|------|-------------------|---------------|
| **Shlink** | self-hosted | PHP 8.4+, MySQL/MariaDB/Postgres/MSSQL/SQLite; ~1 GB RAM per a third-party review | Feature depth: device-specific URLs, max visits, tags, multi-domain, geo, bot filtering, orphan visits, integrations (Matomo, RabbitMQ, Redis, Mercure), imports from Bitly/YOURLS/Kutt/CSV |
| **YOURLS** | self-hosted | PHP + MySQL; MIT | Ubiquity, 240+ plugins, simple admin UI |
| **Kutt** | self-hosted / hosted | Node 20+, SQLite/Postgres/MySQL, optional Redis | Accounts, OIDC login, link passwords, custom domains, browser extensions, ShareX/Alfred/iOS shortcut integrations |
| **Dub** | open core / SaaS | Next.js | Conversion/attribution tracking, affiliate programs, QR, folders, webhooks, SDKs |
| **Sink** | self-hosted | Cloudflare Workers | Zero-ops deployment, real-time globe, AI slugs, social-preview customisation, JSON/CSV import-export |
| **Bitly / Rebrandly / Short.io** | SaaS | n/a | Brand, custom domains, UTM builders, passwords/expiry (tier-gated), bulk APIs (Short.io: 1000 links per call), team features |

## Pass 1: feature matrix (what exists vs. what we have)

✔ have · ◐ partial · ✘ missing · — not applicable / not verified

| Capability | Shlink | YOURLS | Kutt | Dub | Sink | **Hitchly** |
|------------|:-:|:-:|:-:|:-:|:-:|:-:|
| Custom slugs, expiry | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Click analytics (time, referrer) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Geo / device / browser breakdown | ✔ | ◐ | ✔ | ✔ | ✔ | ✘ |
| Bot filtering | ✔ | — | — | — | — | ✔ |
| Max visits per link | ✔ | — | — | — | — | ✔ |
| Tags / search | ✔ | — | — | ✔ | — | ✔ |
| Password-protected links | — | plugin | ✔ | ✔ | — | ✘ |
| Device-targeted redirects | ✔ | — | — | ✔ | — | ✘ |
| Custom / multiple domains | ✔ | ✘ | ✔ | ✔ | ◐ | ✘ |
| Users / accounts / SSO | ◐ | plugin | ✔ | ✔ | ✘ | ✘ (single token) |
| QR codes | ✔ | plugin | — | ✔ | ✔ | ✔ |
| REST API | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| First-party CLI | ✔ (server-side) | ◐ | ✘ | ✘ | ✘ | **✔ (remote)** |
| First-party SDK | ◐ | ✘ | ✘ | ✔ | ✘ | ✔ (Python) |
| Import from other shorteners | ✔ | — | — | ✔ | JSON | ◐ (CSV/JSON only) |
| Export analytics (CSV) | ✔ | — | — | ✔ | ✔ | ✔ |
| Webhooks / event integrations | ✔ | plugin | — | ✔ | — | ✘ |
| Prometheus metrics | — | — | — | — | — | **✔** |
| Online backup command | — | — | — | — | — | ✔ |
| Dead-link checker | — | plugin? | — | — | — | **✔** |
| Zero external dependencies / one process / one file DB | ✘ | ✘ | ✘ | ✘ | ✘ (Cloudflare) | **✔** |

## Pass 2: per rival, what to learn and what to ignore

**Shlink** (closest rival) — Strength is breadth. *Learn:* bot filtering, max visits, tags, device targeting, importing
from competitors (the strongest adoption lever: you can leave your old shortener in one command). *Where we can beat it:*
install weight (PHP + a real database + ~1 GB RAM vs. one Python process), a remote CLI that works from any machine
(its CLI runs on the server; third-party remote CLIs exist and its official one was still marked "TO DO" in the search
result), a Python SDK, `check`/`backup`/`metrics`. *Ignore:* RabbitMQ/Mercure integrations: infrastructure we deliberately avoid.

**YOURLS** — The incumbent, extensible via plugins. *Learn:* people expect a bookmarklet and a low barrier to entry.
*Ignore:* a plugin system (a large surface for a small tool; the API + SDK is our extension point). *Beat it on:* API quality, security defaults, QR, tooling.

**Kutt** — Nice UX, link passwords, accounts. *Learn:* password-protected links; browser/launcher integrations
(ShareX, Alfred, iOS Shortcuts), which the API already supports and docs can show. *Ignore (for now):* accounts/OIDC/email
verification: it triples the scope (ADR 0003), and Redis/Postgres weight.

**Dub** — Attribution/affiliate platform. *Learn:* tags/folders, webhooks, bulk import. *Ignore:* conversion tracking and
affiliate programs: a different product, SaaS-shaped.

**Sink** — Serverless minimalism. *Learn:* import/export symmetry, readable analytics. *Ignore:* AI slugs, globe visualisation.
Cloudflare lock-in is the opposite of our "run anywhere" story.

**Bitly / Rebrandly / Short.io** — Table stakes in SaaS: passwords, expiry, UTM builder, bulk create. Their paywalls (Bitly's free
plan: 5 links per search summaries) are the reason self-hosting exists. *Learn:* bulk create at scale (Short.io: up to 1000 links
per request), UTM helpers.

## Pass 3: honest assessment and decisions

**Positioning:** *the lightest complete shortener, with the best tooling.* We don't beat Shlink on features and shouldn't try;
we win when someone wants a link service they can run in one command, script from anywhere, and trust to behave.

The three gaps that most hurt trust in a shortener, in order:
1. **Analytics integrity: no bot filtering.** Link-preview crawlers (Slack, WhatsApp, Googlebot) inflate clicks; every
   serious rival filters bots. Cheap to do with User-Agent heuristics. *Decision: build.*
2. **Link control: no tags/search, no max visits, no password.** Needed as soon as there are more than a few dozen links
   or links with sensitive targets. *Decision: build all three.*
3. **Migration: can't import from rivals.** *Decision: build generic column mapping for CSV (we can't verify rivals' export
   formats from here, so we avoid hard-coding them).*

Considered and **deliberately not built** (reasons recorded so we don't re-litigate):

| Idea | Why not now |
|------|-------------|
| Webhooks on click | Server-side outbound requests need SSRF protection, retries and a queue: a lot of risk for a niche need. Metrics + CSV cover monitoring. |
| Accounts / SSO | ADR 0003; multiple revocable tokens (#5) is the proportionate step. |
| Geo analytics | Needs a GeoIP database (dependency + licensing); would break ADR 0001. |
| Custom/multi-domain | Works today by pointing several domains at one instance; per-domain slug namespaces are a bigger design. |
| Plugin system | API + SDK is the extension point. |
| Device-targeted redirects | Useful for app links, but UA sniffing is brittle; revisit on demand. |

Quick wins that cost almost nothing and match rivals' conveniences: a bookmarklet / `#new=` prefill in the UI
(YOURLS-style), and docs recipes for ShareX/iOS Shortcuts/Alfred using the existing API (Kutt ships these as integrations).

## Roadmap produced by this analysis
Tracked as GitHub issues: schema migrations (prerequisite) → bot filtering → tags + search → max visits →
password-protected links → import column mapping → bookmarklet and integration recipes.
