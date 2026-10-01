import unittest

from hitchly.domain import Conflict, NotFound, ValidationError
from hitchly.service import DAY, LinkService
from hitchly.storage import Storage

BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"


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
        self.assertEqual(self.svc.resolve("abc", "https://news.site/", BROWSER), "https://example.com")
        self.svc.resolve("abc", "https://news.site/", BROWSER)
        self.svc.resolve("abc", user_agent=BROWSER)
        stats = self.svc.stats("abc")
        self.assertEqual(stats["total_clicks"], 3)
        self.assertEqual(stats["clicks_per_day"][0]["clicks"], 3)
        self.assertEqual(stats["top_referrers"][0], {"referrer": "https://news.site/", "clicks": 2})
        self.assertEqual(self.svc.get(link.slug).clicks, 3)

    def test_expiry(self):
        self.svc.create("https://example.com", slug="temp", ttl_seconds=60)
        self.assertIsNotNone(self.svc.resolve("temp", user_agent=BROWSER))
        self.now += 60
        self.assertIsNone(self.svc.resolve("temp", user_agent=BROWSER))
        self.assertEqual(self.svc.get("temp").clicks, 1)  # expired hit not counted
        self.assertEqual(self.svc.purge_expired(), 1)
        with self.assertRaises(NotFound):
            self.svc.get("temp")

    def test_delete_removes_clicks_too(self):
        self.svc.create("https://example.com", slug="gone")
        self.svc.resolve("gone", user_agent=BROWSER)
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
        self.svc.resolve("old", user_agent=BROWSER)
        self.now += 10 * DAY
        self.svc.resolve("old", user_agent=BROWSER)
        self.assertEqual(len(self.svc.stats("old", days=7)["clicks_per_day"]), 1)
        self.assertEqual(len(self.svc.stats("old", days=30)["clicks_per_day"]), 2)

    def test_update_url_and_expiry(self):
        self.svc.create("https://a.com", slug="edit", ttl_seconds=60)
        link = self.svc.update("edit", {"url": "https://b.com"})
        self.assertEqual((link.url, link.expires_at), ("https://b.com", self.now + 60))  # expiry untouched
        self.assertEqual(self.svc.update("edit", {"ttl_seconds": 120}).expires_at, self.now + 120)
        self.assertIsNone(self.svc.update("edit", {"ttl_seconds": None}).expires_at)  # clear

    def test_update_rejects_bad_input(self):
        self.svc.create("https://a.com", slug="edit")
        for bad in [{}, {"slug": "new"}, {"url": "ftp://x"}, {"ttl_seconds": 0}]:
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                self.svc.update("edit", bad)
        with self.assertRaises(NotFound):
            self.svc.update("missing", {"url": "https://x.com"})
        self.assertEqual(self.svc.get("edit").url, "https://a.com")

    def test_update_revives_expired_link(self):
        self.svc.create("https://a.com", slug="old", ttl_seconds=10)
        self.now += 20
        self.assertIsNone(self.svc.resolve("old", user_agent=BROWSER))
        self.svc.update("old", {"ttl_seconds": None})
        self.assertEqual(self.svc.resolve("old", user_agent=BROWSER), "https://a.com")

    def test_export_clicks(self):
        self.svc.create("https://a.com", slug="exp")
        self.svc.resolve("exp", "https://r/", BROWSER)
        self.assertEqual(self.svc.export_clicks("exp"), [(self.now, "https://r/", BROWSER, False)])

    def test_bots_are_recorded_but_not_counted(self):
        self.svc.create("https://example.com", slug="bots")
        self.svc.resolve("bots", user_agent=BROWSER)
        self.svc.resolve("bots", user_agent="Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)")
        self.svc.resolve("bots", user_agent=BROWSER, head=True)  # HEAD = scanner
        self.svc.resolve("bots")  # no User-Agent
        link = self.svc.get("bots")
        self.assertEqual((link.clicks, link.bot_clicks), (1, 3))
        stats = self.svc.stats("bots")
        self.assertEqual((stats["total_clicks"], stats["bot_clicks"]), (1, 3))
        self.assertEqual(stats["clicks_per_day"][0]["clicks"], 1)
        self.assertEqual(self.svc.stats("bots", include_bots=True)["clicks_per_day"][0]["clicks"], 4)
        self.assertEqual(self.svc.totals()["bot_clicks"], 3)
        self.assertEqual([c[3] for c in self.svc.export_clicks("bots")], [False, True, True, True])


if __name__ == "__main__":
    unittest.main()
