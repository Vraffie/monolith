"""Use-cases. Orchestrates domain rules and storage; knows nothing about HTTP."""

from __future__ import annotations

import time
from typing import Callable

from .domain import (
    Conflict,
    Link,
    NotFound,
    PasswordRequired,
    ValidationError,
    generate_slug,
    validate_slug,
    validate_max_visits,
    validate_password,
    validate_tags,
    validate_ttl,
    validate_url,
)
from .bots import is_bot
from .passwords import hash_password, verify_password
from .storage import Storage

DAY = 86400


class LinkService:
    def __init__(self, storage: Storage, clock: Callable[[], int] = lambda: int(time.time())) -> None:
        self.storage = storage
        self.clock = clock

    def create(self, url: object, slug: object = None, ttl_seconds: object = None,
               tags: object = None, max_visits: object = None, password: object = None) -> Link:
        url = validate_url(url)
        ttl = validate_ttl(ttl_seconds)
        tag_list = validate_tags(tags)
        cap = validate_max_visits(max_visits)
        secret = validate_password(password)
        pw_hash = hash_password(secret) if secret else None
        now = self.clock()
        expires_at = now + ttl if ttl else None

        if slug not in (None, ""):
            return self.storage.create_link(validate_slug(slug), url, now, expires_at, tag_list, cap, pw_hash)

        for length in (7, 7, 7, 8, 9):  # collisions are rare; widen if they keep happening
            try:
                return self.storage.create_link(generate_slug(length), url, now, expires_at, tag_list, cap, pw_hash)
            except Conflict:
                continue
        raise RuntimeError("could not allocate a unique slug")

    def update(self, slug: str, changes: dict) -> Link:
        """Edit a link. Only `url`, `ttl_seconds`, `tags` and `max_visits` may change; the slug is permanent.

        `ttl_seconds` restarts the countdown from now; `None` removes the expiry.
        `tags` replaces the whole tag list. `password` sets a new password; `None` removes protection.
        """
        unknown = set(changes) - {"url", "ttl_seconds", "tags", "max_visits", "password"}
        if unknown:
            raise ValidationError(f"cannot change: {', '.join(sorted(unknown))}")
        if not changes:
            raise ValidationError("nothing to update (send url, ttl_seconds, tags, max_visits and/or password)")
        self.get(slug)  # 404 before validating
        update: dict = {}
        if "url" in changes:
            update["url"] = validate_url(changes["url"])
        if "ttl_seconds" in changes:
            ttl = validate_ttl(changes["ttl_seconds"])
            update["expires_at"] = self.clock() + ttl if ttl else None
        if "tags" in changes:
            update["tags"] = validate_tags(changes["tags"])
        if "max_visits" in changes:
            update["max_visits"] = validate_max_visits(changes["max_visits"])
        if "password" in changes:
            secret = validate_password(changes["password"])
            update["password_hash"] = hash_password(secret) if secret else None
        self.storage.update_link(slug, update)
        return self.get(slug)

    def export_clicks(self, slug: str) -> list[tuple[int, str | None, str | None, bool]]:
        return self.storage.list_clicks(self.get(slug).id)

    def get(self, slug: str) -> Link:
        link = self.storage.get_link(slug)
        if link is None:
            raise NotFound(slug)
        return link

    def list(self, limit: int = 50, offset: int = 0, tag: str | None = None,
             q: str | None = None) -> tuple[list[Link], int]:
        limit = max(1, min(limit, 200))
        tag = tag.strip().lower() if tag else None
        return self.storage.list_links(limit, max(0, offset), tag, q), self.storage.count_links(tag, q)

    def delete(self, slug: str) -> None:
        if not self.storage.delete_link(slug):
            raise NotFound(slug)

    def resolve(self, slug: str, referrer: str | None = None, user_agent: str | None = None,
                head: bool = False, password: str | None = None) -> str | None:
        """Return the target URL and record the click.

        Raises NotFound for unknown slugs and PasswordRequired for protected links without the right password
        (nothing is recorded in that case); returns None if the link has expired or used up its visit cap.
        """
        link = self.get(slug)
        now = self.clock()
        if link.is_expired(now) or link.exhausted:
            return None
        if link.password_hash and not (password is not None and verify_password(password, link.password_hash)):
            raise PasswordRequired(wrong=password is not None)
        # HEAD is what scanners and preview fetchers send; a person's browser sends GET.
        stored = self.storage.record_click(link.id, now, referrer, user_agent,
                                           bot=head or is_bot(user_agent), max_visits=link.max_visits)
        return link.url if stored else None

    def stats(self, slug: str, days: int = 7, include_bots: bool = False) -> dict:
        link = self.get(slug)
        since = self.clock() - days * DAY
        return {
            "slug": link.slug,
            "total_clicks": link.clicks,
            "bot_clicks": link.bot_clicks,
            "includes_bots": include_bots,
            "clicks_per_day": [{"day": d, "clicks": n}
                               for d, n in self.storage.clicks_per_day(link.id, since, include_bots)],
            "top_referrers": [{"referrer": r, "clicks": n}
                              for r, n in self.storage.top_referrers(link.id, include_bots=include_bots)],
        }

    def totals(self) -> dict[str, int]:
        return self.storage.totals(self.clock())

    def purge_expired(self) -> int:
        return self.storage.purge_expired(self.clock())
