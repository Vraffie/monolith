# hitch

Command-line client for a Hitchly server. Installed with the package (`pip install .`) or run
from a checkout with `python3 -m hitchctl`.

```bash
export HITCHLY_URL=https://go.example.com   # default http://127.0.0.1:8080
export HITCHLY_TOKEN=...                    # required (or --token)
```

| Command | What it does |
|---------|--------------|
| `hitch new URL [--slug S] [--ttl 2h]` | Create a link; prints the short URL (script-friendly) |
| `hitch ls [--limit N] [--json]` | List links as a table or JSON |
| `hitch get SLUG` | Show one link as JSON |
| `hitch edit SLUG [--target URL] [--ttl 7d \| --no-expiry]` | Change destination and/or expiry |
| `hitch rm SLUG [-y]` | Delete (asks for confirmation unless `-y`) |
| `hitch stats SLUG [--days N]` | Totals, per-day bars, top referrers |
| `hitch clicks SLUG` | Raw click log as CSV on stdout |
| `hitch qr SLUG [-o FILE]` | QR code of the short URL as SVG |
| `hitch export [--format json\|csv]` | Every link, paged transparently |
| `hitch import FILE [--skip-existing]` | Bulk create from `.json` (list of objects) or `.csv` with columns `url[,slug,ttl_seconds]` |
| `hitch check [--timeout S] [--workers N]` | HEAD/GET every target; prints dead ones |

Durations: seconds (`90`) or with a unit `s m h d w` (`15m`, `2h`, `7d`, `1w`).

Exit codes: `0` success · `1` failure (API error, aborted, dead links found, failed import rows) ·
`2` usage error (no token, nothing to change).

## Recipes
```bash
# Migrate between servers
HITCHLY_URL=https://old hitch export > links.json
HITCHLY_URL=https://new hitch import links.json --skip-existing

# Nightly dead-link report (cron mails the output when the exit code is non-zero)
hitch check || echo "dead links found"

# Use in scripts
SHORT=$(hitch new "https://example.com/release-notes" --slug v1-1 --ttl 30d)
```
`import` preserves slugs, TTLs and targets, but not click history or original creation times.
