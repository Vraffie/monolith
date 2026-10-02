"""SQLite persistence. The only module that knows SQL."""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from typing import Iterator

from .bots import is_bot
from .domain import Conflict, Link

# Ordered, append-only. Entry i upgrades a database from user_version i to i+1.
# Never edit a released migration; add a new one. Entry 0 is idempotent so it also
# adopts databases created before migrations existed (user_version 0 with tables).
MIGRATIONS = [
    """
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
    """,
    # 1: bot classification (history is backfilled from the stored User-Agent)
    "ALTER TABLE clicks ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;",
    lambda conn: conn.executemany(
        "UPDATE clicks SET is_bot = 1 WHERE id = ?",
        [(r[0],) for r in conn.execute("SELECT id, user_agent FROM clicks").fetchall() if is_bot(r[1])],
    ),
    # 2: tags
    """
    CREATE TABLE link_tags (
        link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
        tag     TEXT NOT NULL,
        PRIMARY KEY (link_id, tag)
    );
    CREATE INDEX idx_link_tags_tag ON link_tags(tag);
    """,
    # 3: optional cap on human visits
    "ALTER TABLE links ADD COLUMN max_visits INTEGER;",
    # 4: optional password (stored only as a salted scrypt hash)
    "ALTER TABLE links ADD COLUMN password_hash TEXT;",
    # 5: per-link visit counters. Counting the clicks table on every redirect was O(clicks) (24 ms at 100k, 164 ms at 500k
    # on one link); counters are updated in the same transaction as the click row, so reads are O(1).
    """
    ALTER TABLE links ADD COLUMN clicks INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE links ADD COLUMN bot_clicks INTEGER NOT NULL DEFAULT 0;
    UPDATE links SET
        clicks     = (SELECT COUNT(*) FROM clicks c WHERE c.link_id = links.id AND c.is_bot = 0),
        bot_clicks = (SELECT COUNT(*) FROM clicks c WHERE c.link_id = links.id AND c.is_bot = 1);
    """,
]

_LINK_SELECT = """
SELECT l.id, l.slug, l.url, l.created_at, l.expires_at, l.max_visits, l.password_hash,
       l.clicks, l.bot_clicks,
       (SELECT group_concat(t.tag, ',') FROM link_tags t WHERE t.link_id = l.id) AS tags
FROM links l
"""


def _row_to_link(row: sqlite3.Row) -> Link:
    return Link(row["id"], row["slug"], row["url"], row["created_at"], row["expires_at"], row["clicks"], row["bot_clicks"],
                tuple(sorted((row["tags"] or "").split(","))) if row["tags"] else (),
                row["max_visits"], row["password_hash"])


class Storage:
    def __init__(self, path: str = "hitchly.db") -> None:
        self.path = path
        # An in-memory database exists per connection, so share a single one.
        self._shared = sqlite3.connect(":memory:", check_same_thread=False) if path == ":memory:" else None
        if self._shared:
            self._configure(self._shared)
        self._click_lock = threading.Lock()
        self._local = threading.local()  # one connection per thread, reused: opening one per query was the bottleneck
        self._migrate()

    def _migrate(self) -> None:
        conn = self._shared or sqlite3.connect(self.path, timeout=10, isolation_level=None)
        try:
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            if version > len(MIGRATIONS):
                raise RuntimeError(
                    f"database schema v{version} is newer than this program (v{len(MIGRATIONS)}); upgrade Hitchly"
                )
            for target, step in enumerate(MIGRATIONS[version:], start=version + 1):
                if callable(step):  # Python data migration, atomic via an explicit transaction
                    conn.execute("BEGIN IMMEDIATE")
                    try:
                        step(conn)
                        conn.execute(f"PRAGMA user_version = {target}")
                        conn.execute("COMMIT")
                    except BaseException:
                        conn.execute("ROLLBACK")
                        raise
                else:  # executescript issues its own COMMIT first; BEGIN..COMMIT makes the step atomic
                    conn.executescript(f"BEGIN IMMEDIATE;\n{step}\nPRAGMA user_version = {target};\nCOMMIT;")
            if not self._shared:
                # WAL: readers never block the writer and vice versa. NORMAL sync is safe against application crashes;
                # after a power cut the last transactions may be lost but the database stays consistent.
                conn.execute("PRAGMA journal_mode = WAL")
        finally:
            if not self._shared:
                conn.close()

    @staticmethod
    def _configure(conn: sqlite3.Connection) -> None:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")

    @property
    def schema_version(self) -> int:
        with self._conn() as conn:
            return conn.execute("PRAGMA user_version").fetchone()[0]

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = self._shared or getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self.path, timeout=10)
            self._configure(conn)
            conn.execute("PRAGMA synchronous = NORMAL")
            conn.execute("PRAGMA cache_size = -512")  # 0.5 MiB per connection (default 2 MiB x one connection per thread)
            conn.execute("PRAGMA journal_size_limit = 16777216")  # shrink the WAL file back after checkpoints
            self._local.conn = conn
        with conn:  # commit or roll back; the connection stays open for the thread's next query
            yield conn

    def create_link(self, slug: str, url: str, created_at: int, expires_at: int | None,
                    tags: tuple[str, ...] = (), max_visits: int | None = None,
                    password_hash: str | None = None) -> Link:
        with self._conn() as conn:
            try:
                cur = conn.execute(
                    "INSERT INTO links (slug, url, created_at, expires_at, max_visits, password_hash) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (slug, url, created_at, expires_at, max_visits, password_hash),
                )
            except sqlite3.IntegrityError:
                raise Conflict(slug) from None
            conn.executemany("INSERT INTO link_tags (link_id, tag) VALUES (?, ?)",
                             [(cur.lastrowid, t) for t in tags])
            return Link(cur.lastrowid, slug, url, created_at, expires_at, 0, 0, tuple(tags), max_visits, password_hash)

    def get_link(self, slug: str) -> Link | None:
        with self._conn() as conn:
            row = conn.execute(_LINK_SELECT + " WHERE l.slug = ?", (slug,)).fetchone()
        return _row_to_link(row) if row else None

    def update_link(self, slug: str, changes: dict) -> bool:
        """Apply only the keys present in `changes`: url, expires_at, max_visits, tags. False if no such link."""
        sets, args = [], []
        for column in ("url", "expires_at", "max_visits", "password_hash"):
            if column in changes:
                sets.append(f"{column} = ?")
                args.append(changes[column])
        with self._conn() as conn:
            row = conn.execute("SELECT id FROM links WHERE slug = ?", (slug,)).fetchone()
            if row is None:
                return False
            if sets:
                conn.execute(f"UPDATE links SET {', '.join(sets)} WHERE id = ?", (*args, row["id"]))
            if "tags" in changes:
                conn.execute("DELETE FROM link_tags WHERE link_id = ?", (row["id"],))
                conn.executemany("INSERT INTO link_tags (link_id, tag) VALUES (?, ?)",
                                 [(row["id"], t) for t in changes["tags"]])
            return True

    def list_clicks(self, link_id: int, limit: int = 10000) -> list[tuple[int, str | None, str | None, bool]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT ts, referrer, user_agent, is_bot FROM clicks WHERE link_id = ? ORDER BY ts, id LIMIT ?",
                (link_id, limit),
            ).fetchall()
        return [(r["ts"], r["referrer"], r["user_agent"], bool(r["is_bot"])) for r in rows]

    @staticmethod
    def _filters(tag: str | None, q: str | None) -> tuple[str, list]:
        where, args = [], []
        if tag:
            where.append("EXISTS (SELECT 1 FROM link_tags t WHERE t.link_id = l.id AND t.tag = ?)")
            args.append(tag)
        if q:
            like = "%" + q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            where.append("(lower(l.slug) LIKE ? ESCAPE '\\' OR lower(l.url) LIKE ? ESCAPE '\\')")
            args += [like, like]
        return (" WHERE " + " AND ".join(where)) if where else "", args

    def list_links(self, limit: int = 50, offset: int = 0, tag: str | None = None,
                   q: str | None = None) -> list[Link]:
        clause, args = self._filters(tag, q)
        with self._conn() as conn:
            rows = conn.execute(
                _LINK_SELECT + clause + " ORDER BY l.id DESC LIMIT ? OFFSET ?", (*args, limit, offset)
            ).fetchall()
        return [_row_to_link(r) for r in rows]

    def count_links(self, tag: str | None = None, q: str | None = None) -> int:
        clause, args = self._filters(tag, q)
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM links l" + clause, args).fetchone()[0]

    def delete_link(self, slug: str) -> bool:
        with self._conn() as conn:
            return conn.execute("DELETE FROM links WHERE slug = ?", (slug,)).rowcount > 0

    def record_click(self, link_id: int, ts: int, referrer: str | None, user_agent: str | None,
                     bot: bool = False, max_visits: int | None = None) -> bool:
        """Insert a click. With `max_visits`, a human click is only stored while the cap has room.

        The check and insert are ONE statement, so concurrent visitors cannot overshoot the cap.
        Returns False if the cap was already reached (nothing stored).
        """
        cap = max_visits if not bot else None  # bots never consume, and are never blocked by, the cap
        # Serialise click writes inside this process: queueing on a lock beats SQLite's sleep-and-retry busy handler when
        # dozens of threads write at once (measured at 50 connections: p99 1.0 s -> 0.2 s).
        with self._click_lock, self._conn() as conn:
            if bot:
                conn.execute("UPDATE links SET bot_clicks = bot_clicks + 1 WHERE id = ?", (link_id,))
            else:
                # One conditional UPDATE is both the cap check and the increment, so concurrent visitors cannot overshoot.
                cur = conn.execute(
                    "UPDATE links SET clicks = clicks + 1 WHERE id = ? AND (? IS NULL OR clicks < ?)", (link_id, cap, cap)
                )
                if cur.rowcount != 1:
                    return False
            conn.execute(
                "INSERT INTO clicks (link_id, ts, referrer, user_agent, is_bot) VALUES (?, ?, ?, ?, ?)",
                (link_id, ts, (referrer or "")[:512] or None, (user_agent or "")[:256] or None, int(bot)),
            )
            return True

    def clicks_per_day(self, link_id: int, since: int, include_bots: bool = False) -> list[tuple[str, int]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT date(ts, 'unixepoch') AS day, COUNT(*) AS n FROM clicks "
                "WHERE link_id = ? AND ts >= ? AND (? OR is_bot = 0) GROUP BY day ORDER BY day",
                (link_id, since, int(include_bots)),
            ).fetchall()
        return [(r["day"], r["n"]) for r in rows]

    def top_referrers(self, link_id: int, limit: int = 5, include_bots: bool = False) -> list[tuple[str, int]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT referrer, COUNT(*) AS n FROM clicks WHERE link_id = ? AND referrer IS NOT NULL "
                "AND (? OR is_bot = 0) GROUP BY referrer ORDER BY n DESC, referrer LIMIT ?",
                (link_id, int(include_bots), limit),
            ).fetchall()
        return [(r["referrer"], r["n"]) for r in rows]

    def totals(self, now: int) -> dict[str, int]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT COUNT(*), COALESCE(SUM(clicks), 0), "
                "COALESCE(SUM(CASE WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 1 ELSE 0 END), 0), "
                "COALESCE(SUM(bot_clicks), 0) FROM links", (now,)
            ).fetchone()
        return {"links": row[0], "clicks": row[1], "expired_links": row[2], "bot_clicks": row[3]}

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
