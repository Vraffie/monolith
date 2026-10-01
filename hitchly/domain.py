"""Pure domain rules: validation and slug generation. No I/O here."""

from __future__ import annotations

import re
import secrets
import string
from dataclasses import dataclass
from urllib.parse import urlsplit

ALPHABET = string.ascii_letters + string.digits
SLUG_RE = re.compile(r"^[A-Za-z0-9_-]{3,32}$")
RESERVED_SLUGS = frozenset({"api", "health", "static", "favicon.ico", "robots.txt", "metrics"})
MAX_URL_LENGTH = 2048
TAG_RE = re.compile(r"^[a-z0-9_-]{1,32}$")
MAX_TAGS = 10
MAX_TTL_SECONDS = 10 * 365 * 24 * 3600


class ValidationError(ValueError):
    """Input rejected by a domain rule (maps to HTTP 400)."""


class Conflict(Exception):
    """Slug already taken (maps to HTTP 409)."""


class NotFound(Exception):
    """Unknown slug (maps to HTTP 404)."""


@dataclass(frozen=True)
class Link:
    id: int
    slug: str
    url: str
    created_at: int
    expires_at: int | None
    clicks: int = 0  # human visits (bots excluded)
    bot_clicks: int = 0
    tags: tuple[str, ...] = ()

    def is_expired(self, now: int) -> bool:
        return self.expires_at is not None and now >= self.expires_at


def validate_url(url: object) -> str:
    if not isinstance(url, str) or not url.strip():
        raise ValidationError("url is required")
    url = url.strip()
    if len(url) > MAX_URL_LENGTH:
        raise ValidationError(f"url longer than {MAX_URL_LENGTH} characters")
    if any(c.isspace() or ord(c) < 32 for c in url):
        raise ValidationError("url must not contain whitespace or control characters")
    try:
        parts = urlsplit(url)
        parts.port  # raises ValueError on a bad port
    except ValueError:
        raise ValidationError("url is malformed") from None
    if parts.scheme not in ("http", "https"):
        raise ValidationError("url must start with http:// or https://")
    if not parts.hostname:
        raise ValidationError("url must include a host")
    return url


def validate_slug(slug: object) -> str:
    if not isinstance(slug, str) or not SLUG_RE.match(slug):
        raise ValidationError("slug must be 3-32 characters of A-Z a-z 0-9 _ -")
    if slug.lower() in RESERVED_SLUGS:
        raise ValidationError(f"slug '{slug}' is reserved")
    return slug


def validate_ttl(ttl: object) -> int | None:
    if ttl is None:
        return None
    if isinstance(ttl, bool) or not isinstance(ttl, int) or not 1 <= ttl <= MAX_TTL_SECONDS:
        raise ValidationError("ttl_seconds must be a positive integer (max 10 years)")
    return ttl


def validate_tags(tags: object) -> tuple[str, ...]:
    """Normalise to a sorted, de-duplicated tuple of lowercase tags."""
    if tags is None:
        return ()
    if not isinstance(tags, (list, tuple)) or not all(isinstance(t, str) for t in tags):
        raise ValidationError("tags must be a list of strings")
    cleaned = sorted({t.strip().lower() for t in tags if t.strip()})
    if len(cleaned) > MAX_TAGS:
        raise ValidationError(f"at most {MAX_TAGS} tags per link")
    for t in cleaned:
        if not TAG_RE.match(t):
            raise ValidationError(f"invalid tag '{t}' (use 1-32 characters of a-z 0-9 _ -)")
    return tuple(cleaned)


def generate_slug(length: int = 7) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))
