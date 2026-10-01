"""Use-cases. Orchestrates domain rules and storage; knows nothing about HTTP."""

from __future__ import annotations

import time
from typing import Callable

from .domain import (
    Conflict,
    Link,
    NotFound,
    ValidationError,
    generate_slug,
    validate_slug,
    validate_ttl,
    validate_url,
)
from .storage import Storage

DAY = 86400


class LinkService:
    def __init__(self, storage: Storage, clock: Callable[[], int] = lambda: int(time.time())) -> None:
        self.storage = storage
        self.clock = clock

    def create(self, url: object, slug: object = None, ttl_seconds: object = None) -> Link:
        url = validate_url(url)
        ttl = validate_ttl(ttl_seconds)
        now = self.clock()
        expires_at = now + ttl if ttl else None

        if slug not in (None, ""):
            return self.storage.create_link(validate_slug(slug), url, now, expires_at)

        for length in (7, 7, 7, 8, 9):  # collisions are rare; widen if they keep happening
            try:
                return self.storage.create_link(generate_slug(length), url, now, expires_at)
            except Conflict:
                continue
        raise RuntimeError("could not allocate a unique slug")

    def update(self, slug: str, changes: dict) -> Link:
        """Edit a link. Only `url` and `ttl_seconds` may change; the slug is permanent.

        `ttl_seconds` restarts the countdown from now; `None` removes the expiry.
        """
        unknown = set(changes) - {"url", "ttl_seconds"}
        if unknown:
            raise ValidationError(f"cannot change: {', '.join(sorted(unknown))}")
        if not changes:
            raise ValidationError("nothing to update (send url and/or ttl_seconds)")
        self.get(slug)  # 404 before validating
        url = validate_url(changes["url"]) if "url" in changes else None
        set_expiry = "ttl_seconds" in changes
        ttl = validate_ttl(changes.get("ttl_seconds"))
        self.storage.update_link(slug, url, self.clock() + ttl if ttl else None, set_expiry)
        return self.get(slug)

    def export_clicks(self, slug: str) -> list[tuple[int, str | None, str | None]]:
        return self.storage.list_clicks(self.get(slug).id)

    def get(self, slug: str) -> Link:
        link = self.storage.get_link(slug)
        if link is None:
            raise NotFound(slug)
        return link

    def list(self, limit: int = 50, offset: int = 0) -> tuple[list[Link], int]:
        limit = max(1, min(limit, 200))
        return self.storage.list_links(limit, max(0, offset)), self.storage.count_links()

    def delete(self, slug: str) -> None:
        if not self.storage.delete_link(slug):
            raise NotFound(slug)

    def resolve(self, slug: str, referrer: str | None = None, user_agent: str | None = None) -> str | None:
        """Return the target URL and record the click.

        Raises NotFound for unknown slugs; returns None if the link has expired.
        """
        link = self.get(slug)
        now = self.clock()
        if link.is_expired(now):
            return None
        self.storage.record_click(link.id, now, referrer, user_agent)
        return link.url

    def stats(self, slug: str, days: int = 7) -> dict:
        link = self.get(slug)
        since = self.clock() - days * DAY
        return {
            "slug": link.slug,
            "total_clicks": link.clicks,
            "clicks_per_day": [{"day": d, "clicks": n} for d, n in self.storage.clicks_per_day(link.id, since)],
            "top_referrers": [{"referrer": r, "clicks": n} for r, n in self.storage.top_referrers(link.id)],
        }

    def totals(self) -> dict[str, int]:
        return self.storage.totals(self.clock())

    def purge_expired(self) -> int:
        return self.storage.purge_expired(self.clock())
