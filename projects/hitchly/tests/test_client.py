"""The SDK exercised against a real in-process server."""

import threading
import unittest

from hitchly_client import Hitchly, HitchlyError
from hitchly.config import Config
from hitchly.service import LinkService
from hitchly.storage import Storage
from hitchly.web import create_server


class ClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config = Config(host="127.0.0.1", port=0, db_path=":memory:", token="tok")
        cls.server = create_server(LinkService(Storage(":memory:")), config)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.server.server_address[1]}"
        cls.api = Hitchly(cls.url, "tok")

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_crud(self):
        link = self.api.create("https://example.com", slug="sdk-1", ttl_seconds=100)
        self.assertEqual(self.api.get("sdk-1")["url"], "https://example.com")
        self.assertIsNotNone(link["expires_at"])
        self.assertIsNone(self.api.update("sdk-1", ttl_seconds=None)["expires_at"])
        self.assertEqual(self.api.update("sdk-1", url="https://b.com")["url"], "https://b.com")
        self.api.delete("sdk-1")
        with self.assertRaises(HitchlyError) as cm:
            self.api.get("sdk-1")
        self.assertEqual(cm.exception.status, 404)

    def test_iter_links_pages(self):
        for i in range(5):
            self.api.create("https://example.com", slug=f"page-{i}")
        slugs = [l["slug"] for l in self.api.iter_links(page_size=2)]
        self.assertTrue({f"page-{i}" for i in range(5)} <= set(slugs))
        self.assertEqual(len(slugs), len(set(slugs)))

    def test_errors_carry_message_and_status(self):
        with self.assertRaises(HitchlyError) as cm:
            self.api.create("ftp://nope")
        self.assertEqual(cm.exception.status, 400)
        self.assertIn("http", str(cm.exception))
        with self.assertRaises(HitchlyError) as cm:
            Hitchly(self.url, "wrong").list()
        self.assertEqual(cm.exception.status, 401)

    def test_trace_is_ssrf_guarded(self):
        r = self.api.trace("http://169.254.169.254/latest/meta-data/")
        self.assertFalse(r["ok"])
        self.assertEqual(r["hops"], [])
        self.assertEqual(self.api.check_links(["no-such-slug"])[0]["error"], "not found")

    def test_unreachable(self):
        with self.assertRaises(HitchlyError) as cm:
            Hitchly("http://127.0.0.1:1", "x", timeout=1).health()
        self.assertIsNone(cm.exception.status)

    def test_stats_csv_metrics_health(self):
        self.api.create("https://example.com", slug="sdk-stat")
        self.assertEqual(self.api.stats("sdk-stat")["total_clicks"], 0)
        self.assertTrue(self.api.clicks_csv("sdk-stat").startswith("timestamp_utc"))
        self.assertTrue(self.api.qr_svg("sdk-stat").startswith("<svg"))
        self.assertIn("hitchly_links", self.api.metrics())
        self.assertEqual(self.api.health()["status"], "ok")


if __name__ == "__main__":
    unittest.main()
