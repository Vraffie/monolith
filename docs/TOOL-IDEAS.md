# More tools and use cases: research and recommendations

Researched 2026-10-01. Sources: the IT-Tools repository (its `src/tools` directory listing, ~85 tools), CyberChef's README, DevToys summaries,
LinkStack/LittleLink, PrivateBin, Short.io/Dub/Rebrandly feature summaries and MDN's `share_target` page (links at the end). Two sites (devtoys.app,
it-tools.tech) were unreachable from the research sandbox, so category details for DevToys come from search summaries. Popularity claims below are
"offered by several established toolboxes", not usage data: **we found no reliable usage statistics.**

## Where we stand
We have 22 tools. Compared with IT-Tools' list, we already cover Base64, URL encode, JWT, hash/HMAC, UUID, password/token, JSON, date/time,
colour, regex, case/slug/text stats, integer base, QR (including Wi-Fi), URL parser, UTM and the link service. What the established toolboxes have that we lack
falls into four buckets.

## A. Quick wins: pure client-side, testable with published vectors
Each is one module in `ui/lib` plus a thin UI file, with node tests (same pattern as today).

| Tool | Offered by | Why / how we'd test it |
|------|-----------|------------------------|
| **Text diff** (and JSON diff) | IT-Tools, DevToys | Used constantly; Myers diff, tests on known edit scripts |
| **Cron expression explainer + next runs** | IT-Tools (crontab), DevToys | We tell people to use cron in our own docs; tests on known schedules |
| **JSON ⇄ CSV, JSON ⇄ YAML, JSON ⇄ XML** | IT-Tools, DevToys | Highest-demand converters. CSV reuses our parser; YAML needs a supported-subset parser: say so plainly in the UI |
| **HTTP status codes + MIME types reference** | IT-Tools | Cross-links to the redirect tracer: "301 vs 302: what each does to caching and analytics" |
| **TOTP / OTP generator** | IT-Tools | RFC 6238 Appendix B gives exact vectors; HMAC is already in our hash lib; pairs with a QR `otpauth://` preset |
| **IPv4/IPv6 subnet calculator, range expander** | IT-Tools | Pure arithmetic with BigInt (we have it); tests against CIDR tables |
| ULID generator, lorem ipsum, chmod calculator, HTML entities, string escape/unescape, text ⇄ binary/hex/Unicode, NATO alphabet, roman numerals, percentage and unit converters, Basic-auth header, email normaliser, IBAN validator (mod 97) | IT-Tools, DevToys | Each is tiny; IBAN and ULID have published test vectors |
| RSA/ECDSA key pair (PEM), passphrase text encryption (PBKDF2 + AES-GCM) | IT-Tools | WebCrypto does the work. Ship with an honest warning and a versioned output format |

## B. Tools only we can do well (they reuse what we already built)
| Idea | Why it is a good fit |
|------|----------------------|
| **QR styling with a contrast guard**: colours, error-correction levels L/M/Q/H, optional logo, print-size guidance | We already have a contrast checker and a verified encoder; most generators let you make unscannable codes. We can verify new levels with the same independent decoder (zxing-cpp) |
| **QR scanner from an image** | Pairs with the generator. The browser `BarcodeDetector` API is not available everywhere, so it would be "works where supported" unless we write a decoder (large) |
| **Open Graph / meta tag generator + link preview** | The redirect tracer already reads titles and descriptions, so we can show "this is how your link will look when shared" |
| **User-Agent parser with our bot verdict** | `bots.py` already classifies; a JS port with shared test cases would let people see *why* a click was counted as a bot |
| **Safelink / tracking-redirect unwrapper** (Outlook SafeLinks, `google.com/url?q=`) | IT-Tools has "safelink decoder"; fits the link family and the tracer |
| **Smart decode ("magic")**: paste anything, we detect Base64, hex, percent-encoding, JWT, UUID, timestamps, JSON and show the candidates | CyberChef's best-loved feature (its "magic" detection), cheap with the libs we have |
| **Recipes: chain operations** (decode → format → hash) with the recipe in the URL | CyberChef's core idea; our pure functions are already composable |

## C. Cross-cutting improvements (likely worth more than any single tool)
- **Shareable state in the URL fragment** (`#/base64?i=…`): fragments are never sent to the server, so this is private by construction.
- **Command palette** (Ctrl/Cmd+K), recents and favourites, drag-and-drop for file inputs, a theme toggle.
- **Installable and offline (PWA).** All client-side tools can work with no network. `share_target` lets Android Chrome's share sheet open our "shorten this" prefill; it is **not supported on iOS Safari** (MDN, below), so don't promise it there. A service worker needs `worker-src 'self'`, which our CSP already allows.
- An accessibility pass (labels, focus order, contrast) with an automated checker in the e2e suite.

## D. New use cases for the link service
| Case | Evidence | Notes |
|------|----------|-------|
| **Browser / OS / device breakdown** in analytics | Our own matrix marks this ✘; Shlink, Kutt, Dub have it | Cheap: parse the stored User-Agent, no GeoIP needed |
| **Scheduled start** (`starts_at`) next to expiry | Event and campaign use (short links for events, printed material) | Tiny schema change |
| **301/302 choice per link** + bulk redirect map import | SEO and site-migration cases; we always send 302 so every visit is counted | 301s are cached by browsers, which hides repeat visits: say so |
| **Default UTM applied at redirect** | Rebrandly/Short.io pair shorteners with UTM builders | Keeps QR codes short while analytics still get campaign tags |
| **A/B split and device routing** (several destinations, iOS vs Android) | Short.io and Dub advertise A/B and mobile targeting | Larger; do after the analytics work gives us something to measure |
| **Link-in-bio pages** | LinkStack, LittleLink and similar form a whole category | Needs a "public" flag and a design for what is exposed |
| **Zero-knowledge secret notes (burn after reading)** | PrivateBin's model: encrypt in the browser, put the key in the URL fragment, server stores only ciphertext, optional burn-after-reading | See below: strongest "new product" idea |
| **Browser extension** (shorten the current page) | Kutt ships extensions | MV3 extension; testable with Playwright but more setup |

### Secret notes, sketched
Encrypt in the browser with AES-GCM (WebCrypto), POST only ciphertext to a new `notes` table with optional expiry and "burn after N reads", and share
`https://host/n/<id>#<key>`. The server never sees the key. PrivateBin documents one real-world trap: chat and email scanners prefetch URLs and can trigger
the burn, so burning must happen on an explicit API call made by the page's JavaScript after a user click, never on the plain GET. Our existing max-visits
logic (atomic conditional insert) and rate limits are reusable. Threat-model honestly in the UI: the server operator could serve modified JavaScript, so
this protects against database leaks and passive logging, not a malicious server.

## E. Deliberately not building (and why)
| Idea | Reason |
|------|--------|
| Markdown → HTML preview | Needs a sanitiser to be safe; without one it is an XSS tool. Revisit with a minimal safe subset |
| bcrypt / argon2 hashing | Needs a large pure-JS or WASM implementation; poor value-to-weight |
| PDF / Office tools | Heavy libraries; breaks our zero-dependency stance |
| BIP39 / wallet seed generation | High-stakes secrets and a 2,048-word list to ship and audit |
| MAC vendor lookup, phone-number parsing | Need large datasets (OUI registry, libphonenumber metadata) |
| Camera recorder, device info | Permission prompts and privacy surface for little value |
| AI features | Need external API keys, which conflicts with "nothing leaves your server/browser" |

## Use cases to document (personas)
Event organiser (badge QR, schedule link, `starts_at`), restaurant (menu QR + Wi-Fi QR), small business (vCard QR, review-page link), teacher
(class links that expire), dev team (release links, UTM + QR, bulk import), support engineer (UA parser, status codes, tracer), security analyst (smart decode,
JWT, hashes, redirect tracer), marketer (UTM + QR + stats + bot filtering). The existing README says what the tools do; a short "who is this for" page per
persona would be cheap and good for discoverability.

## Suggested order
1. **Batch 1**: section A (diff, cron, converters, status codes, TOTP, subnet, small utilities).
2. **Batch 2**: shareable URL state, command palette, smart decode, QR styling.
3. **Batch 3**: PWA + share target; link analytics breakdown; `starts_at`, 301/302, default UTM.
4. **Batch 4**: secret notes (own design review first).

## Sources
- IT-Tools tool list: <https://github.com/CorentinTh/it-tools/tree/main/src/tools> · CyberChef: <https://github.com/gchq/CyberChef> · DevToys: <https://github.com/DevToys-app/DevToys>
- LinkStack: <https://linkstack.org/> · LittleLink-Server: <https://github.com/techno-tim/littlelink-server>
- PrivateBin encryption format: <https://github.com/PrivateBin/PrivateBin/wiki/Encryption-format> · overview: <https://privacytools.io/app/privatebin>
- Short.io and Dub feature comparison (search summaries): <https://martech.zone/short-io-url-shortener/>, <https://dub.co/>
- Web Share Target: <https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target>
- Short links for event marketing: <https://y.hn/blog/short-links-event-marketing-guide>
