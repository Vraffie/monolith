"""Python client for the Linkly API (standard library only).

    from linkly_client import Linkly
    api = Linkly("http://localhost:8080", token="...")
    link = api.create("https://example.com", slug="docs", ttl_seconds=3600)
    for l in api.iter_links(): print(l["short_url"], l["clicks"])
"""

from .client import Linkly, LinklyError

__all__ = ["Linkly", "LinklyError"]
__version__ = "1.1.0"
