"""Python client for the Hitchly API (standard library only).

    from hitchly_client import Hitchly
    api = Hitchly("http://localhost:8080", token="...")
    link = api.create("https://example.com", slug="docs", ttl_seconds=3600)
    for l in api.iter_links(): print(l["short_url"], l["clicks"])
"""

from .client import Hitchly, HitchlyError

__all__ = ["Hitchly", "HitchlyError"]
__version__ = "1.1.0"
