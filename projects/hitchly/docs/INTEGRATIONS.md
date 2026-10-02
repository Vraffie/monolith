# Integration recipes

Anything that can send an HTTP request with an `Authorization` header can drive Hitchly. Recipes marked
*tested* were run against a real server; *sketch* means the steps follow the API but were not run on that platform.

## Bookmarklet *(tested in headless Chromium)*
Open the web UI, expand **Bookmarklet**, drag **Hitch this page** to your bookmarks bar. Clicking it on any page opens
`https://<your-host>/#new=<page url>`, with the URL already filled in. Some sites with a strict Content-Security-Policy block bookmarklets.
The same `#new=` link works as a share target anywhere you can open a URL.

## Shell function *(tested)*
```bash
# ~/.bashrc
export HITCHLY_URL=https://go.example.com HITCHLY_TOKEN=...
hitchit() { hitch new "$1" ${2:+--slug "$2"} | tee >(command -v xclip >/dev/null && xclip -selection clipboard); }
```
```bash
hitchit https://example.com/some/long/path docs      # prints (and copies) https://go.example.com/docs
```
Without the CLI: `curl -s -X POST "$HITCHLY_URL/api/links" -H "Authorization: Bearer $HITCHLY_TOKEN" -d '{"url":"https://example.com"}'`.

## GitHub Actions: a short link per release *(sketch)*
```yaml
- run: pip install "git+https://github.com/<you>/monolith"
- run: |
    hitch new "${{ github.event.release.html_url }}" --slug "release-${{ github.event.release.tag_name }}" --tag release --ttl 90d
  env:
    HITCHLY_URL: ${{ vars.HITCHLY_URL }}
    HITCHLY_TOKEN: ${{ secrets.HITCHLY_TOKEN }}
```

## Cron: weekly hygiene *(tested commands)*
```cron
0 3 * * 0  cd /opt/hitchly && python3 -m hitchly purge && python3 -m hitchly backup /backups/hitchly-$(date +\%F).db
30 3 * * 0 hitch check || echo "dead links found"        # cron mails any output
```

## One-time links for sharing secrets *(tested)*
```bash
HITCHLY_LINK_PW='correct horse' hitch new https://files.example.com/contract.pdf --max-visits 1 --ttl 2d --password-env HITCHLY_LINK_PW
```
The link stops working after one human visit or two days, whichever comes first, and asks for the password before redirecting.

## iOS Shortcuts / Android HTTP Shortcuts *(sketch)*
1. *Receive* URLs from the share sheet.
2. *Get contents of URL*: `POST https://<host>/api/links`, header `Authorization: Bearer <token>`, request body JSON `{"url": <Shortcut Input>}`.
3. Read `short_url` from the JSON response and *Copy to clipboard*.

## Prometheus / Grafana *(tested endpoint)*
`GET /metrics` with the token; see [DEPLOYMENT.md](DEPLOYMENT.md#monitoring). Useful alerts: `increase(hitchly_clicks_total[1h]) == 0` for a
campaign link, `hitchly_links_expired > 100` if you forgot the purge cron.
