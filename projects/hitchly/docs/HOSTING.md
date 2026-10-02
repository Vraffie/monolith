# Hosting and testing for free

Researched 2026-10-01 from vendor pages and third-party summaries (linked below). **Free tiers change often; verify before you rely on one.**
We could not create accounts or deploy from the research sandbox, so everything under "Hosting" is *recommended, not tested by us*, except the static
bundle, which we did serve locally under a sub-path exactly like GitHub Pages does.

## What needs hosting?
Hitchly has two halves with very different needs:

| Part | Needs | Free options |
|------|-------|--------------|
| **Toolbox** (QR, UTM, Base64, JWT, hashes, UUID, JSON, regex, colours, …) | Static files only. Everything runs in the visitor's browser. | GitHub Pages, Cloudflare Pages: genuinely free, no card, HTTPS included |
| **Link service** (short links, redirects, stats, tracer, checker, admin) | A running Python process **and a persistent disk** for the SQLite file | Your own hardware + Cloudflare Tunnel, or Oracle Always Free; most "free PaaS" tiers are poor fits (below) |

## 1. Static toolbox, free, no card (do this first)
`.github/workflows/pages.yml` publishes `hitchly/ui` as a static site. One-time setup: **Settings → Pages → Source: GitHub Actions**, then push to `main`.
The page detects that there is no server and explains that the link tools need one; all client-side tools work.
- GitHub Pages: HTTPS and custom domains are free; soft limits are about 1 GB site size, 100 GB/month bandwidth and 10 builds/hour ([source](https://everhour.com/blog/how-to-host-website-on-github/)). Free plans need a **public** repository for Pages.
- Alternative: Cloudflare Pages, unlimited bandwidth, 500 builds/month, 5 custom domains per project ([source](https://dev.to/david_viejo_4d48fdfa7cfff/cloudflare-pages-free-tier-limits-pricing-2026-1f8f)). Point it at the repo, build command none, output directory `_site` (assemble as in the workflow).
- GitHub Pages cannot set HTTP headers, so the CSP comes from the `<meta>` tag in `index.html` (it cannot express `frame-ancestors`).

### Or skip hosting entirely: the single-file bundle
`npm run bundle` produces `dist/hitchly-toolbox.html`, the whole client-side toolbox in one file that works from `file://` with no network. Share it by email or USB, or put that one file on any static host. See the README.

## 2. The server, ranked for *this* app (SQLite file, one process)

| Option | Cost | Persistent disk | Fit | Notes |
|--------|------|:---:|:---:|-------|
| **Your own machine or a Raspberry Pi + Cloudflare Tunnel** | free (+ optional ~$10/yr domain) | yes | ★★★★★ | Tunnel gives HTTPS with no open ports; Cloudflare says tunnels are free with unmetered bandwidth ([source](https://bex.co/blog/2026/07/28/cloudflare-tunnel-free-zero-open-ports-ingress)). Quick tunnels (`cloudflared tunnel --url http://localhost:8080`) need no account but use a random URL that disappears when stopped, with a 200 in-flight request cap ([source](https://recca0120.github.io/en/2026/04/14/cloudflare-tunnel-2026/)). A named tunnel needs a domain on Cloudflare. |
| **Oracle Cloud Always Free VM** | free | yes (200 GB) | ★★★★ | Always-Free Arm allowance was cut in June 2026 to 2 OCPU / 12 GB; sign-up is strict (card verification) and Arm capacity is sometimes unavailable; idle instances can be reclaimed, so run something regularly ([source](https://terminalbytes.com/oracle-cloud-free-tier-changes-2026/)). Plenty for Hitchly. |
| Koyeb free instance | free | unclear | ★★ | 0.1 vCPU / 512 MB / 2 GB SSD, scales to zero after about an hour, **card required since Feb 2026** ([source](https://flywp.com/blog/9769/best-free-docker-hosting-platforms/)). We could not confirm whether the SSD survives restarts: test before trusting it. |
| Railway | ~$1/month credit after a 30-day trial | 0.5 GB volume | ★★ | Tiny allowance; fine for a trial ([source](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026), vendor-authored). |
| Render free web service | free | **no** | ★ | Sleeps after 15 min idle; free instances have no persistent disk, so SQLite resets on redeploy/restart. Cards required per one summary. Demo only. |
| Hugging Face Spaces (Docker) | free | **no** | ★ | 50 GB *ephemeral* disk wiped on restart; sleeps after 48 h idle ([source](https://tds.s-anand.net/2025-09/huggingface-spaces/)). Fine for a throwaway demo of the toolbox. |
| Fly.io | paid | n/a | – | No free tier for new accounts (trial only) ([source](https://www.saaspricepulse.com/tools/flyio)). |

**Recommendation:** static toolbox on GitHub Pages now; for the link service use a home server or spare Pi with a Cloudflare Tunnel, or an Oracle Always Free VM if you want it off your own network.

### Running the server on any of them
```bash
docker run -d --restart unless-stopped -p 127.0.0.1:8080:8080 -v hitchly-data:/data \
  -e HITCHLY_TOKEN=... -e HITCHLY_BASE_URL=https://go.example.com ghcr.io/<you>/hitchly   # or build with the Dockerfile
# without Docker:  pip install .  &&  HITCHLY_TOKEN=... hitchly serve
```
Then put the tunnel (or nginx, see [DEPLOYMENT.md](DEPLOYMENT.md)) in front, set `HITCHLY_TRUST_PROXY=1` **only** if the proxy overwrites `X-Forwarded-For`, and schedule `hitch backup`.

### If you must use an ephemeral host
SQLite on a disk that is wiped loses every link. Mitigate, don't ignore: run `hitch backup` from a cron job elsewhere (it downloads a consistent copy through the API), and restore by placing the file at `HITCHLY_DB` before start-up. We have **not** built automatic restore-on-boot; if you want to host this way, that is the feature to ask for.

### A fourth option: Cloudflare Workers + D1 (feasibility shown, not shipped)
`experiments/workers-spike/` shows the core running on Workers + D1 in the real Workers runtime. It would give **free persistent hosting** with no server, but it is a spike, not a supported deployment; quotas and the
password-hashing CPU cost were not tested. See [STACK-REVIEW.md](STACK-REVIEW.md).

## 3. Testing for free

| What | How | Cost |
|------|-----|------|
| Python unit + integration tests (113) | `python -m unittest discover -s tests` | free, no dependencies |
| JS library tests (20) | `node --test "tests/js/*.test.mjs"` (Node 22) | free |
| Browser end-to-end tests (4 scripts) | `npm i playwright && npx playwright install chromium`, start the server, run `node tests/e2e/*.cjs` (see the header of each file) | free |
| CI on every push | `.github/workflows/ci.yml` runs all of the above plus a Docker build. GitHub Actions is free for public repositories; private repositories get a monthly free allowance (check the current number) | free |
| Try it from your phone / share a preview | run locally, then `cloudflared tunnel --url http://localhost:8080` (no account) | free |
| Static bundle locally | `mkdir -p /tmp/site/hitchly && cp -r hitchly/ui /tmp/site/hitchly/ && mv /tmp/site/hitchly/ui/index.html /tmp/site/hitchly/ && python -m http.server -d /tmp/site 8086`, open `http://127.0.0.1:8086/hitchly/` | free |

Not verified: the Dockerfile, `docker-compose.yml`, and the `pages.yml`/`ci.yml` workflows have never been executed (no Docker daemon or GitHub Actions runner in our environment).

## Testing on a phone

Pick by what you want to check. **Use HTTPS if you can:** browsers only expose `crypto.subtle` (Hash/HMAC, encryption, key pairs, TOTP), the clipboard and install-to-home-screen on secure origins, so over plain `http://192.168…` those tools fail even though the page loads.

| Goal | How | HTTPS |
|---|---|---|
| Look and feel, tap targets, scrolling (fastest) | Same Wi-Fi: `HITCHLY_HOST=0.0.0.0 HITCHLY_TOKEN=x python -m hitchly serve`, open `http://<your-computer-ip>:8080` on the phone (allow the port in your firewall). Only for a trusted network; stop it afterwards. | no: crypto/clipboard tools will not work |
| Everything, with a link you can open on any phone | `cloudflared tunnel --url http://localhost:8080` (no account) prints a temporary `https://….trycloudflare.com` URL. Anyone with the link can reach your server while it runs, so set a real `HITCHLY_TOKEN`. | yes |
| The static toolbox, permanently | Push to `main`: the Pages workflow publishes it at `https://<user>.github.io/<repo>/` (one-time: Settings → Pages → Source: GitHub Actions). Client-side tools only. | yes |
| Offline, no server at all | `make bundle`, send `dist/hitchly-toolbox.html` to the phone (AirDrop, cloud drive, USB) and open it from Files. Image/QR/text tools work; whether crypto tools work from a `file://` page depends on the phone browser, so check those. | browser-dependent |

Before using a real phone, a desktop browser's device mode (DevTools → toggle device toolbar) shows the layout at 390 px, and `tests/e2e/a11y.cjs` already checks every tool for horizontal overflow and small tap targets at that width. That is an approximation: it does not cover iOS Safari, on-screen keyboards, or the camera/file pickers, which is what a real phone is for. Worth checking by hand: the menu button, the tab rows in bundled tools, file pickers in the image tools (on iOS the "Photo Library" chooser may hand over HEIC; the cleaner supports JPEG, PNG and WebP only), and copy buttons.
