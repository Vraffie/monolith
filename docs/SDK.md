# Python SDK (`hitchly_client`)

Zero-dependency client used by `hitch`. Python 3.10+.

```python
from hitchly_client import Hitchly, HitchlyError

api = Hitchly("http://localhost:8080", token="...", timeout=10)

link = api.create("https://example.com/docs", slug="docs", ttl_seconds=3600, tags=["docs"], max_visits=100, password="correct horse")
for l in api.iter_links(tag="docs"): ...      # also q="substring"
print(link["short_url"])

api.update("docs", url="https://example.com/docs/v2")   # change target
api.update("docs", ttl_seconds=None)                     # remove expiry (omit the argument to leave it alone)

for l in api.iter_links():                               # pages through every link
    print(l["slug"], l["clicks"])

print(api.stats("docs", days=30)["clicks_per_day"])
csv_text = api.clicks_csv("docs")
api.delete("docs")

try:
    api.get("missing")
except HitchlyError as e:
    print(e.status, e)                                   # 404 not found
```

| Method | Endpoint |
|--------|----------|
| `create(url, slug=None, ttl_seconds=None, tags=None, max_visits=None, password=None)` | `POST /api/links` |
| `get(slug)` · `list(limit, offset)` · `iter_links(page_size)` | `GET /api/links…` |
| `update(slug, url=None, ttl_seconds=…, tags=None, max_visits=…, password=…)` | `PATCH /api/links/{slug}` |
| `delete(slug)` | `DELETE /api/links/{slug}` |
| `stats(slug, days)` · `clicks_csv(slug)` · `qr_svg(slug, scale)` | stats / `clicks.csv` / `qr.svg` |
| `bulk_create(links)` · `overview()` · `purge()` · `backup(dest)` | `POST /api/links/bulk` · `GET /api/overview` · `POST /api/purge` · `GET /api/backup` |
| `trace(url)` · `check_links(slugs)` | `POST /api/tools/trace` · `POST /api/links/check` |
| `metrics()` · `health()` | `/metrics`, `/health` |

Failures raise `HitchlyError` with `.status` (HTTP code, or `None` when the server is unreachable).
Redirects are never followed, so the client can't be bounced to another host with your token.
