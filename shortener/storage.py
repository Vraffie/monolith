"""SQLite persistence. The only module that knows SQL."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .domain import Conflict, Link

SCHEMA = """
CREATE TABLE IF NOT EXISTS links (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT NOT NULL UNIQUE,
    url        TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS clicks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id    INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    ts         INTEGER NOT NULL,
    referrer   TEXT,
    user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_clicks_link_ts ON clicks(link_id, ts);
"""

_LINK_SELECT = """
SELECT l.id, l.slug, l.url, l.created_at, l.expires_at,
       (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id) AS clicks
FROM links l
"""


def _row_to_link(row: sqlite3.Row) -> Link:
    return Link(row["id"], row["slug"], row["url"], row["created_at"], row["expires_at"], row["clicks"])


class Storage:
    def __init__(self, path: str = "linkly.db") -> None:
        self.path = path
        # An in-memory database exists per connection, so share a single one.
        self._shared = sqlite3.connect(":memory:", check_same_thread=False) if path == ":memory:" else None
        with self._conn() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = self._shared or sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            with conn:  # commit or roll back
                yield conn
        finally:
            if not self._shared:
                conn.close()

    def create_link(self, slug: str, url: str, created_at: int, expires_at: int | None) -> Link:
        with self._conn() as conn:
            try:
                cur = conn.execute(
                    "INSERT INTO links (slug, url, created_at, expires_at) VALUES (?, ?, ?, ?)",
                    (slug, url, created_at, expires_at),
                )
            except sqlite3.IntegrityError:
                raise Conflict(slug) from None
            return Link(cur.lastrowid, slug, url, created_at, expires_at, 0)

    def get_link(self, slug: str) -> Link | None:
        with self._conn() as conn:
            row = conn.execute(_LINK_SELECT + " WHERE l.slug = ?", (slug,)).fetchone()
        return _row_to_link(row) if row else None

    def update_link(self, slug: str, url: str | None, expires_at: int | None, set_expiry: bool) -> bool:
        sets, args = [], []
        if url is not None:
            sets.append("url = ?"); args.append(url)
        if set_expiry:
            sets.append("expires_at = ?"); args.append(expires_at)
        if not sets:
            return self.get_link(slug) is not None
        with self._conn() as conn:
            return conn.execute(f"UPDATE links SET {', '.join(sets)} WHERE slug = ?", (*args, slug)).rowcount > 0

    def list_clicks(self, link_id: int, limit: int = 10000) -> list[tuple[int, str | None, str | None]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT ts, referrer, user_agent FROM clicks WHERE link_id = ? ORDER BY ts, id LIMIT ?",
                (link_id, limit),
            ).fetchall()
        return [(r["ts"], r["referrer"], r["user_agent"]) for r in rows]

    def list_links(self, limit: int = 50, offset: int = 0) -> list[Link]:
        with self._conn() as conn:
            rows = conn.execute(
                _LINK_SELECT + " ORDER BY l.id DESC LIMIT ? OFFSET ?", (limit, offset)
            ).fetchall()
        return [_row_to_link(r) for r in rows]

    def count_links(self) -> int:
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM links").fetchone()[0]

    def delete_link(self, slug: str) -> bool:
        with self._conn() as conn:
            return conn.execute("DELETE FROM links WHERE slug = ?", (slug,)).rowcount > 0

    def record_click(self, link_id: int, ts: int, referrer: str | None, user_agent: str | None) -> None:
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO clicks (link_id, ts, referrer, user_agent) VALUES (?, ?, ?, ?)",
                (link_id, ts, (referrer or "")[:512] or None, (user_agent or "")[:256] or None),
            )

    def clicks_per_day(self, link_id: int, since: int) -> list[tuple[str, int]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT date(ts, 'unixepoch') AS day, COUNT(*) AS n FROM clicks "
                "WHERE link_id = ? AND ts >= ? GROUP BY day ORDER BY day",
                (link_id, since),
            ).fetchall()
        return [(r["day"], r["n"]) for r in rows]

    def top_referrers(self, link_id: int, limit: int = 5) -> list[tuple[str, int]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT referrer, COUNT(*) AS n FROM clicks WHERE link_id = ? AND referrer IS NOT NULL "
                "GROUP BY referrer ORDER BY n DESC, referrer LIMIT ?",
                (link_id, limit),
            ).fetchall()
        return [(r["referrer"], r["n"]) for r in rows]

    def totals(self, now: int) -> dict[str, int]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT (SELECT COUNT(*) FROM links), (SELECT COUNT(*) FROM clicks), "
                "(SELECT COUNT(*) FROM links WHERE expires_at IS NOT NULL AND expires_at <= ?)", (now,)
            ).fetchone()
        return {"links": row[0], "clicks": row[1], "expired_links": row[2]}

    def backup(self, dest: str) -> None:
        """Consistent online copy using SQLite's backup API (safe while serving)."""
        if self._shared:
            raise RuntimeError("cannot back up an in-memory database")
        target = sqlite3.connect(dest)
        try:
            with self._conn() as conn:
                conn.backup(target)
        finally:
            target.close()

    def purge_expired(self, now: int) -> int:
        with self._conn() as conn:
            return conn.execute(
                "DELETE FROM links WHERE expires_at IS NOT NULL AND expires_at <= ?", (now,)
            ).rowcount
