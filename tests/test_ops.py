import os
import sqlite3
import tempfile
import unittest

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
