import unittest

from shortener.domain import Conflict, NotFound, ValidationError
from shortener.service import DAY, LinkService
from shortener.storage import Storage


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.now = 1_700_000_000
        self.svc = LinkService(Storage(":memory:"), clock=lambda: self.now)

    def test_create_generates_slug(self):
        link = self.svc.create("https://example.com")
        self.assertEqual(len(link.slug), 7)
        self.assertEqual(self.svc.get(link.slug).url, "https://example.com")

    def test_custom_slug_conflict(self):
        self.svc.create("https://a.com", slug="docs")
        with self.assertRaises(Conflict):
            self.svc.create("https://b.com", slug="docs")

    def test_validation_errors_propagate(self):
        with self.assertRaises(ValidationError):
            self.svc.create("nope")

    def test_resolve_records_clicks(self):
        link = self.svc.create("https://example.com", slug="abc")
        self.assertEqual(self.svc.resolve("abc", "https://news.site/", "UA"), "https://example.com")
        self.svc.resolve("abc", "https://news.site/")
        self.svc.resolve("abc")
        stats = self.svc.stats("abc")
        self.assertEqual(stats["total_clicks"], 3)
        self.assertEqual(stats["clicks_per_day"][0]["clicks"], 3)
        self.assertEqual(stats["top_referrers"][0], {"referrer": "https://news.site/", "clicks": 2})
        self.assertEqual(self.svc.get(link.slug).clicks, 3)

    def test_expiry(self):
        self.svc.create("https://example.com", slug="temp", ttl_seconds=60)
        self.assertIsNotNone(self.svc.resolve("temp"))
        self.now += 60
        self.assertIsNone(self.svc.resolve("temp"))
        self.assertEqual(self.svc.get("temp").clicks, 1)  # expired hit not counted
        self.assertEqual(self.svc.purge_expired(), 1)
        with self.assertRaises(NotFound):
            self.svc.get("temp")

    def test_delete_removes_clicks_too(self):
        self.svc.create("https://example.com", slug="gone")
        self.svc.resolve("gone")
        self.svc.delete("gone")
        with self.assertRaises(NotFound):
            self.svc.delete("gone")
        with self.assertRaises(NotFound):
            self.svc.stats("gone")

    def test_list_newest_first_and_paging(self):
        for i in range(5):
            self.svc.create(f"https://example.com/{i}", slug=f"link{i}")
        links, total = self.svc.list(limit=2, offset=1)
        self.assertEqual(total, 5)
        self.assertEqual([l.slug for l in links], ["link3", "link2"])

    def test_stats_window(self):
        self.svc.create("https://example.com", slug="old")
        self.svc.resolve("old")
        self.now += 10 * DAY
        self.svc.resolve("old")
        self.assertEqual(len(self.svc.stats("old", days=7)["clicks_per_day"]), 1)
        self.assertEqual(len(self.svc.stats("old", days=30)["clicks_per_day"]), 2)


if __name__ == "__main__":
    unittest.main()
