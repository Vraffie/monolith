import os
import sqlite3
import tempfile
import unittest

from hitchly import storage
from hitchly.service import LinkService
from hitchly.storage import Storage

BROWSER = "Mozilla/5.0 Chrome/126.0 Safari/537.36"


class OpsTests(unittest.TestCase):
    def test_backup_is_a_usable_copy(self):
        with tempfile.TemporaryDirectory() as d:
            svc = LinkService(Storage(os.path.join(d, "live.db")))
            svc.create("https://a.com", slug="keep")
            svc.resolve("keep", user_agent=BROWSER)
            dest = os.path.join(d, "backup.db")
            svc.storage.backup(dest)
            restored = LinkService(Storage(dest))
            self.assertEqual(restored.get("keep").clicks, 1)
            self.assertEqual(sqlite3.connect(dest).execute("PRAGMA integrity_check").fetchone()[0], "ok")

    def test_max_visits_is_race_free(self):
        import threading
        with tempfile.TemporaryDirectory() as d:
            svc = LinkService(Storage(os.path.join(d, "race.db")))
            svc.create("https://a.com", slug="race", max_visits=5)
            results, lock = [], threading.Lock()

            def visit():
                ok = svc.resolve("race", user_agent=BROWSER) is not None
                with lock:
                    results.append(ok)

            threads = [threading.Thread(target=visit) for _ in range(25)]
            [t.start() for t in threads]
            [t.join() for t in threads]
            self.assertEqual(sum(results), 5)
            self.assertEqual(svc.get("race").clicks, 5)

    def test_totals(self):
        now = [1000]
        svc = LinkService(Storage(":memory:"), clock=lambda: now[0])
        svc.create("https://a.com", slug="aaa", ttl_seconds=10)
        svc.create("https://b.com", slug="bbb")
        svc.resolve("aaa", user_agent=BROWSER)
        now[0] += 10
        self.assertEqual(svc.totals(), {"links": 2, "clicks": 1, "expired_links": 1, "bot_clicks": 0})


if __name__ == "__main__":
    unittest.main()


class CounterTests(unittest.TestCase):
    """links.clicks / links.bot_clicks are denormalised counters: they must always equal the click rows."""

    def truth(self, path, link_id):
        db = sqlite3.connect(path)
        human = db.execute("SELECT COUNT(*) FROM clicks WHERE link_id = ? AND is_bot = 0", (link_id,)).fetchone()[0]
        bots = db.execute("SELECT COUNT(*) FROM clicks WHERE link_id = ? AND is_bot = 1", (link_id,)).fetchone()[0]
        db.close()
        return human, bots

    def test_counters_match_rows_under_concurrency_with_a_cap(self):
        import threading
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "c.db")
            svc = LinkService(Storage(path))
            capped = svc.create("https://a.com", slug="capped", max_visits=7)
            free = svc.create("https://a.com", slug="freee")
            bot_ua = "Slackbot-LinkExpanding 1.0"

            def visit(i):
                svc.resolve("capped", user_agent=BROWSER if i % 3 else bot_ua)
                svc.resolve("freee", user_agent=BROWSER if i % 2 else bot_ua)
            threads = [threading.Thread(target=visit, args=(i,)) for i in range(60)]
            [t.start() for t in threads]
            [t.join() for t in threads]
            for link in (capped, free):
                got = svc.get(link.slug)
                self.assertEqual((got.clicks, got.bot_clicks), self.truth(path, link.id), link.slug)
            self.assertEqual(svc.get("capped").clicks, 7)  # the cap held
            self.assertEqual(svc.totals()["clicks"], 7 + svc.get("freee").clicks)

    def test_redirect_lookup_never_scans_the_clicks_table(self):
        st = Storage(":memory:")
        plan = " ".join(str(r[3]) for r in st._shared.execute("EXPLAIN QUERY PLAN " + storage._LINK_SELECT + " WHERE l.slug = ?", ("x",)))
        self.assertNotIn("clicks", plan.lower())  # O(1): reading counters, not counting rows
        self.assertIn("slug", plan.lower())

    def test_migration_backfills_counters_from_existing_clicks(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "old.db")
            raw = sqlite3.connect(path, isolation_level=None)
            for step in storage.MIGRATIONS[:5]:  # a genuine database from before the counters existed
                raw.executescript(step) if isinstance(step, str) else step(raw)
            raw.execute("PRAGMA user_version = 5")
            self.assertNotIn("clicks", [c[1] for c in raw.execute("PRAGMA table_info(links)")])
            raw.execute("INSERT INTO links (id, slug, url, created_at) VALUES (1, 'old', 'https://a.com', 1)")
            raw.executemany("INSERT INTO clicks (link_id, ts, referrer, user_agent, is_bot) VALUES (1, ?, NULL, 'UA', ?)",
                            [(i, int(i % 4 == 0)) for i in range(100)])
            raw.close()
            got = Storage(path).get_link("old")
            self.assertEqual((got.clicks, got.bot_clicks), (75, 25))
