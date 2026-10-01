import os
import sqlite3
import tempfile
import unittest

from shortener.service import LinkService
from shortener.storage import Storage


class OpsTests(unittest.TestCase):
    def test_backup_is_a_usable_copy(self):
        with tempfile.TemporaryDirectory() as d:
            svc = LinkService(Storage(os.path.join(d, "live.db")))
            svc.create("https://a.com", slug="keep")
            svc.resolve("keep")
            dest = os.path.join(d, "backup.db")
            svc.storage.backup(dest)
            restored = LinkService(Storage(dest))
            self.assertEqual(restored.get("keep").clicks, 1)
            self.assertEqual(sqlite3.connect(dest).execute("PRAGMA integrity_check").fetchone()[0], "ok")

    def test_totals(self):
        now = [1000]
        svc = LinkService(Storage(":memory:"), clock=lambda: now[0])
        svc.create("https://a.com", slug="aaa", ttl_seconds=10)
        svc.create("https://b.com", slug="bbb")
        svc.resolve("aaa")
        now[0] += 10
        self.assertEqual(svc.totals(), {"links": 2, "clicks": 1, "expired_links": 1})


if __name__ == "__main__":
    unittest.main()
