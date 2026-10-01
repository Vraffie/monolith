import os
import sqlite3
import tempfile
import unittest

from hitchly import storage
from hitchly.storage import Storage

# The exact schema shipped in 1.0/1.1, before migrations existed (user_version 0).
LEGACY = """
CREATE TABLE links (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, url TEXT NOT NULL,
                    created_at INTEGER NOT NULL, expires_at INTEGER);
CREATE TABLE clicks (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
                     ts INTEGER NOT NULL, referrer TEXT, user_agent TEXT);
CREATE INDEX idx_clicks_link_ts ON clicks(link_id, ts);
INSERT INTO links VALUES (1, 'old', 'https://old.example', 100, NULL);
INSERT INTO clicks VALUES (1, 1, 150, 'https://r/', 'Mozilla/5.0 Chrome/126.0 Safari/537.36');
INSERT INTO clicks VALUES (2, 1, 160, NULL, 'Slackbot-LinkExpanding 1.0');
"""


class MigrationTests(unittest.TestCase):
    def test_fresh_database_is_latest(self):
        self.assertEqual(Storage(":memory:").schema_version, len(storage.MIGRATIONS))

    def test_legacy_database_upgrades_in_place_keeping_data(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "legacy.db")
            c = sqlite3.connect(path)
            c.executescript(LEGACY)
            c.close()
            st = Storage(path)
            self.assertEqual(st.schema_version, len(storage.MIGRATIONS))
            link = st.get_link("old")
            self.assertEqual((link.url, link.clicks), ("https://old.example", 1))
            self.assertEqual(link.bot_clicks, 1)  # history was classified by the migration

    def test_reopening_is_a_noop(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "x.db")
            Storage(path).create_link("abc", "https://a.com", 1, None)
            st = Storage(path)
            self.assertEqual(st.get_link("abc").url, "https://a.com")

    def test_refuses_database_from_the_future(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "future.db")
            c = sqlite3.connect(path)
            c.execute(f"PRAGMA user_version = {len(storage.MIGRATIONS) + 1}")
            c.close()
            with self.assertRaises(RuntimeError):
                Storage(path)


if __name__ == "__main__":
    unittest.main()
