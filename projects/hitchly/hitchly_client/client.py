from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Iterator

_UNSET = object()


class HitchlyError(Exception):
    """API or transport failure. `status` is the HTTP status, or None if unreachable."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **kw):
        return None


class Hitchly:
    def __init__(self, base_url: str, token: str, timeout: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self._opener = urllib.request.build_opener(_NoRedirect)

    # ---- transport ---------------------------------------------------
    def _request(self, method: str, path: str, body: dict | None = None) -> tuple[int, bytes, str]:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base_url + path, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with self._opener.open(req, timeout=self.timeout) as res:
                return res.status, res.read(), res.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                message = json.loads(raw)["error"]
            except (ValueError, KeyError, TypeError):
                message = raw.decode(errors="replace").strip() or e.reason
            raise HitchlyError(message, e.code) from None
        except (urllib.error.URLError, OSError) as e:
            raise HitchlyError(f"cannot reach {self.base_url}: {getattr(e, 'reason', e)}") from None

    def _json(self, method: str, path: str, body: dict | None = None):
        _, raw, _ = self._request(method, path, body)
        return json.loads(raw) if raw else None

    # ---- API ---------------------------------------------------------
    def create(self, url: str, slug: str | None = None, ttl_seconds: int | None = None,
               tags: list[str] | None = None, max_visits: int | None = None,
               password: str | None = None) -> dict:
        body: dict = {"url": url}
        if slug:
            body["slug"] = slug
        if ttl_seconds is not None:
            body["ttl_seconds"] = ttl_seconds
        if tags:
            body["tags"] = tags
        if max_visits is not None:
            body["max_visits"] = max_visits
        if password:
            body["password"] = password
        return self._json("POST", "/api/links", body)

    def get(self, slug: str) -> dict:
        return self._json("GET", f"/api/links/{urllib.parse.quote(slug)}")

    def list(self, limit: int = 50, offset: int = 0, tag: str | None = None, q: str | None = None) -> dict:
        query = {"limit": limit, "offset": offset, **({"tag": tag} if tag else {}), **({"q": q} if q else {})}
        return self._json("GET", "/api/links?" + urllib.parse.urlencode(query))

    def iter_links(self, page_size: int = 200, tag: str | None = None, q: str | None = None) -> Iterator[dict]:
        """Yield every matching link, newest first, paging transparently."""
        offset = 0
        while True:
            page = self.list(page_size, offset, tag, q)
            yield from page["links"]
            offset += len(page["links"])
            if not page["links"] or offset >= page["total"]:
                return

    def update(self, slug: str, url: str | None = None, ttl_seconds=_UNSET, tags: list[str] | None = None,
               max_visits=_UNSET, password=_UNSET) -> dict:
        """Change url, expiry, tags and/or visit cap (tags=[] clears; ttl_seconds/max_visits/password=None remove)."""
        body: dict = {}
        if url is not None:
            body["url"] = url
        if ttl_seconds is not _UNSET:
            body["ttl_seconds"] = ttl_seconds
        if tags is not None:
            body["tags"] = tags
        if max_visits is not _UNSET:
            body["max_visits"] = max_visits
        if password is not _UNSET:
            body["password"] = password
        return self._json("PATCH", f"/api/links/{urllib.parse.quote(slug)}", body)

    def delete(self, slug: str) -> None:
        self._request("DELETE", f"/api/links/{urllib.parse.quote(slug)}")

    def stats(self, slug: str, days: int = 7, include_bots: bool = False) -> dict:
        query = f"days={days}" + ("&include_bots=1" if include_bots else "")
        return self._json("GET", f"/api/links/{urllib.parse.quote(slug)}/stats?{query}")

    def clicks_csv(self, slug: str) -> str:
        _, raw, _ = self._request("GET", f"/api/links/{urllib.parse.quote(slug)}/clicks.csv")
        return raw.decode()

    def qr_svg(self, slug: str, scale: int = 8) -> str:
        _, raw, _ = self._request("GET", f"/api/links/{urllib.parse.quote(slug)}/qr.svg?scale={scale}")
        return raw.decode()

    def bulk_create(self, links: list[dict]) -> dict:
        """Create up to 500 links in one request. Returns {"created", "failed", "results": [{"index", "link"|"error","status"}]}.
        Items are independent: failures don't stop the others. Passwords are not accepted in bulk."""
        return self._json("POST", "/api/links/bulk", {"links": links})

    def overview(self) -> dict:
        return self._json("GET", "/api/overview")

    def purge(self) -> int:
        """Delete expired links; returns how many were removed."""
        return self._json("POST", "/api/purge", {})["removed"]

    def backup(self, dest: str) -> int:
        """Download a consistent copy of the server's database to `dest`; returns the size in bytes."""
        _, raw, _ = self._request("GET", "/api/backup")
        with open(dest, "wb") as f:
            f.write(raw)
        return len(raw)

    def trace(self, url: str) -> dict:
        """Ask the server to follow a URL's redirects (SSRF-guarded). Returns hops and the final page."""
        return self._json("POST", "/api/tools/trace", {"url": url})

    def check_links(self, slugs: list[str]) -> list[dict]:
        """Server-side dead-link check of up to 25 stored links."""
        return self._json("POST", "/api/links/check", {"slugs": slugs})["results"]

    def metrics(self) -> str:
        _, raw, _ = self._request("GET", "/metrics")
        return raw.decode()

    def health(self) -> dict:
        return self._json("GET", "/health")
