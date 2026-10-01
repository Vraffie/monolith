"""End-to-end tests against a real server on an ephemeral port."""

import http.client
import json
import threading
import unittest

from hitchly.config import Config
from hitchly.service import LinkService
from hitchly.storage import Storage
from hitchly.web import create_server

TOKEN = "test-token"
BROWSER = "Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36"


class NoRedirect(http.client.HTTPConnection):
    pass


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.now = 1_700_000_000
        config = Config(host="127.0.0.1", port=0, db_path=":memory:", token=TOKEN, auth_fail_limit=1000)
        cls.service = LinkService(Storage(":memory:"), clock=lambda: cls.now)
        cls.server = create_server(cls.service, config)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def request(self, method, path, body=None, token=TOKEN, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = dict(headers or {})
        if token:
            h["Authorization"] = f"Bearer {token}"
        data = None
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body)
            h["Content-Type"] = "application/json"
        conn.request(method, path, data, h)
        res = conn.getresponse()
        raw = res.read()
        conn.close()
        payload = None
        if raw and res.getheader("Content-Type", "").startswith("application/json"):
            payload = json.loads(raw)
        elif raw:
            payload = raw.decode()  # non-JSON bodies (e.g. CSV, metrics) come back as text
        return res.status, payload, res

    def test_health_and_ui_are_public(self):
        status, body, _ = self.request("GET", "/health", token=None)
        self.assertEqual((status, body["status"]), (200, "ok"))
        status, _, res = self.request("GET", "/", token=None)
        self.assertEqual(status, 200)
        self.assertIn("Content-Security-Policy", dict(res.getheaders()))

    def test_api_requires_token(self):
        for method, path in [("GET", "/api/links"), ("POST", "/api/links"), ("DELETE", "/api/links/abc")]:
            for tok in (None, "wrong"):
                status, _, res = self.request(method, path, {}, token=tok)
                self.assertEqual(status, 401, (method, path, tok))
                self.assertEqual(res.getheader("WWW-Authenticate"), "Bearer")

    def test_full_lifecycle(self):
        status, link, res = self.request("POST", "/api/links", {"url": "https://example.com/x", "slug": "life"})
        self.assertEqual(status, 201)
        self.assertEqual(link["short_url"], f"http://127.0.0.1:{self.port}/life")
        self.assertEqual(res.getheader("Location"), "/api/links/life")

        status, _, res = self.request("GET", "/life", token=None, headers={"Referer": "https://ref.example/", "User-Agent": BROWSER})
        self.assertEqual(status, 302)
        self.assertEqual(res.getheader("Location"), "https://example.com/x")

        status, stats, _ = self.request("GET", "/api/links/life/stats")
        self.assertEqual((status, stats["total_clicks"]), (200, 1))
        self.assertEqual(stats["top_referrers"][0]["referrer"], "https://ref.example/")

        status, got, _ = self.request("GET", "/api/links/life")
        self.assertEqual(got["clicks"], 1)

        self.assertEqual(self.request("DELETE", "/api/links/life")[0], 204)
        self.assertEqual(self.request("GET", "/life", token=None)[0], 404)
        self.assertEqual(self.request("DELETE", "/api/links/life")[0], 404)

    def test_errors(self):
        self.assertEqual(self.request("POST", "/api/links", {"url": "ftp://x"})[0], 400)
        self.assertEqual(self.request("POST", "/api/links", b"not json")[0], 400)
        self.assertEqual(self.request("POST", "/api/links", b"[1]")[0], 400)
        self.assertEqual(self.request("POST", "/api/links", {"url": "https://a.com", "slug": "api"})[0], 400)
        self.request("POST", "/api/links", {"url": "https://a.com", "slug": "dup"})
        self.assertEqual(self.request("POST", "/api/links", {"url": "https://b.com", "slug": "dup"})[0], 409)
        self.assertEqual(self.request("GET", "/api/links?limit=abc")[0], 400)
        self.assertEqual(self.request("GET", "/nope-nothing")[0], 404)
        self.assertEqual(self.request("GET", "/api/unknown")[0], 404)
        big = json.dumps({"url": "https://a.com/" + "x" * 9000}).encode()
        self.assertEqual(self.request("POST", "/api/links", big)[0], 400)

    def test_expired_link_returns_410(self):
        self.request("POST", "/api/links", {"url": "https://a.com", "slug": "soon", "ttl_seconds": 30})
        self.assertEqual(self.request("GET", "/soon", token=None)[0], 302)
        type(self).now += 31
        try:
            self.assertEqual(self.request("GET", "/soon", token=None)[0], 410)
            _, link, _ = self.request("GET", "/api/links/soon")
            self.assertTrue(link["expired"])
        finally:
            type(self).now -= 31

    def test_metrics(self):
        self.request("POST", "/api/links", {"url": "https://a.com", "slug": "metric"})
        self.request("GET", "/metric", token=None)
        self.assertEqual(self.request("GET", "/metrics", token=None)[0], 401)
        status, body, res = self.request("GET", "/metrics")
        self.assertEqual(status, 200)
        self.assertTrue(res.getheader("Content-Type").startswith("text/plain"))
        for name in ("hitchly_links ", "hitchly_links_expired ", "hitchly_clicks_total "):
            self.assertIn(name, body)

    def test_bot_visits_redirect_but_are_counted_separately(self):
        self.request("POST", "/api/links", {"url": "https://a.com", "slug": "botty"})
        self.assertEqual(self.request("GET", "/botty", token=None, headers={"User-Agent": "curl/8.5"})[0], 302)
        self.assertEqual(self.request("HEAD", "/botty", token=None, headers={"User-Agent": BROWSER})[0], 302)
        self.request("GET", "/botty", token=None, headers={"User-Agent": BROWSER})
        _, link, _ = self.request("GET", "/api/links/botty")
        self.assertEqual((link["clicks"], link["bot_clicks"]), (1, 2))
        _, stats, _ = self.request("GET", "/api/links/botty/stats?include_bots=1")
        self.assertEqual(stats["clicks_per_day"][0]["clicks"], 3)

    def test_tags_over_http(self):
        status, link, _ = self.request("POST", "/api/links", {"url": "https://a.com", "slug": "tagged", "tags": ["x1", "y2"]})
        self.assertEqual((status, link["tags"]), (201, ["x1", "y2"]))
        _, body, _ = self.request("GET", "/api/links?tag=y2")
        self.assertEqual([l["slug"] for l in body["links"]], ["tagged"])
        self.assertEqual(body["total"], 1)
        self.assertEqual(self.request("PATCH", "/api/links/tagged", {"tags": ["z"]})[1]["tags"], ["z"])
        self.assertEqual(self.request("POST", "/api/links", {"url": "https://a.com", "tags": ["BAD TAG"]})[0], 400)

    def test_max_visits_over_http(self):
        self.request("POST", "/api/links", {"url": "https://a.com", "slug": "once", "max_visits": 1})
        ua = {"User-Agent": BROWSER}
        self.assertEqual(self.request("GET", "/once", token=None, headers=ua)[0], 302)
        status, _, _ = self.request("GET", "/once", token=None, headers=ua)
        self.assertEqual(status, 410)
        _, link, _ = self.request("GET", "/api/links/once")
        self.assertEqual((link["max_visits"], link["exhausted"], link["clicks"]), (1, True, 1))
        self.assertEqual(self.request("PATCH", "/api/links/once", {"max_visits": 0})[0], 400)

    def form_post(self, path, password, headers=None, port=None):
        conn = http.client.HTTPConnection("127.0.0.1", port or self.port, timeout=5)
        body = "password=" + password
        conn.request("POST", path, body, {"Content-Type": "application/x-www-form-urlencoded",
                                          "User-Agent": BROWSER, **(headers or {})})
        res = conn.getresponse()
        raw = res.read().decode()
        conn.close()
        return res.status, raw, res

    def test_password_protected_redirect(self):
        _, link, _ = self.request("POST", "/api/links", {"url": "https://secret.example/x", "slug": "vault", "password": "s3cret!"})
        self.assertTrue(link["protected"])
        self.assertNotIn("password", json.dumps(link))
        self.assertNotIn("scrypt", json.dumps(link))
        ua = {"User-Agent": BROWSER}
        status, body, res = self.request("GET", "/vault", token=None, headers=ua)
        self.assertEqual(status, 200)  # the form, never the target
        self.assertIn("password", body)
        self.assertNotIn("secret.example", body)
        self.assertIn("form-action 'self'", res.getheader("Content-Security-Policy"))
        self.assertEqual(res.getheader("Cache-Control"), "no-store")
        status, body, res = self.form_post("/vault", "wrong")
        self.assertEqual(status, 200)
        self.assertIn("Wrong password", body)
        self.assertIsNone(res.getheader("Location"))
        self.assertEqual(self.request("GET", "/api/links/vault")[1]["clicks"], 0)  # no click until success
        status, _, res = self.form_post("/vault", "s3cret!")
        self.assertEqual((status, res.getheader("Location")), (303, "https://secret.example/x"))
        self.assertEqual(self.request("GET", "/api/links/vault")[1]["clicks"], 1)
        # protection can be removed again
        self.request("PATCH", "/api/links/vault", {"password": None})
        self.assertEqual(self.request("GET", "/vault", token=None, headers=ua)[0], 302)
        self.assertEqual(self.form_post("/nothere-xyz", "x")[0], 404)

    def test_wrong_password_lockout(self):
        config = Config(host="127.0.0.1", port=0, db_path=":memory:", token=TOKEN, auth_fail_limit=3)
        server = create_server(LinkService(Storage(":memory:")), config)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        port = server.server_address[1]
        try:
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            c.request("POST", "/api/links", json.dumps({"url": "https://a.com", "slug": "guard", "password": "rightpw"}),
                      {"Authorization": f"Bearer {TOKEN}"})
            c.getresponse().read(); c.close()
            statuses = [self.form_post("/guard", "bad", port=port)[0] for _ in range(3)]
            self.assertEqual(statuses, [200, 200, 200])
            status, _, res = self.form_post("/guard", "rightpw", port=port)  # even the right one is refused now
            self.assertEqual(status, 429)
            self.assertGreaterEqual(int(res.getheader("Retry-After")), 1)
        finally:
            server.shutdown(); server.server_close()

    def test_qr_svg(self):
        self.request("POST", "/api/links", {"url": "https://a.com", "slug": "qrme"})
        status, body, res = self.request("GET", "/api/links/qrme/qr.svg")
        self.assertEqual((status, res.getheader("Content-Type")), (200, "image/svg+xml"))
        self.assertTrue(body.startswith("<svg"))
        self.assertEqual(self.request("GET", "/api/links/qrme/qr.svg", token=None)[0], 401)
        self.assertEqual(self.request("GET", "/api/links/missing/qr.svg")[0], 404)

    def test_patch(self):
        self.request("POST", "/api/links", {"url": "https://a.com", "slug": "patchme", "ttl_seconds": 99})
        status, link, _ = self.request("PATCH", "/api/links/patchme", {"url": "https://b.com", "ttl_seconds": None})
        self.assertEqual((status, link["url"], link["expires_at"]), (200, "https://b.com", None))
        self.assertEqual(self.request("PATCH", "/api/links/patchme", {"slug": "x"})[0], 400)
        self.assertEqual(self.request("PATCH", "/api/links/nope", {"url": "https://b.com"})[0], 404)
        self.assertEqual(self.request("PATCH", "/api/links/patchme", {"url": "https://b.com"}, token=None)[0], 401)

    def test_clicks_csv_neutralises_formulas(self):
        self.request("POST", "/api/links", {"url": "https://a.com", "slug": "csvtest"})
        self.request("GET", "/csvtest", token=None, headers={"Referer": "=HYPERLINK(\"http://evil\")", "User-Agent": BROWSER})
        status, body, res = self.request("GET", "/api/links/csvtest/clicks.csv")
        self.assertEqual(status, 200)
        self.assertEqual(res.getheader("Content-Type"), "text/csv; charset=utf-8")
        lines = body.splitlines()
        self.assertEqual(lines[0], "timestamp_utc,referrer,user_agent,bot")
        self.assertIn("\"'=HYPERLINK", lines[1])  # leading quote defuses the formula
        self.assertEqual(self.request("GET", "/api/links/csvtest/clicks.csv", token=None)[0], 401)

    def test_list(self):
        self.request("POST", "/api/links", {"url": "https://a.com", "slug": "listed"})
        status, body, _ = self.request("GET", "/api/links?limit=1")
        self.assertEqual(status, 200)
        self.assertEqual(len(body["links"]), 1)
        self.assertGreaterEqual(body["total"], 1)


if __name__ == "__main__":
    unittest.main()


class AuthLimitTests(unittest.TestCase):
    def test_brute_force_gets_429_then_valid_token_also_blocked(self):
        config = Config(host="127.0.0.1", port=0, db_path=":memory:", token=TOKEN, auth_fail_limit=3)
        server = create_server(LinkService(Storage(":memory:")), config)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        port = server.server_address[1]

        def get(token):
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            c.request("GET", "/api/links", headers={"Authorization": f"Bearer {token}"})
            r = c.getresponse(); r.read(); c.close()
            return r

        try:
            self.assertEqual([get("bad").status for _ in range(3)], [401, 401, 401])
            r = get("bad")
            self.assertEqual(r.status, 429)
            self.assertGreaterEqual(int(r.getheader("Retry-After")), 1)
            self.assertEqual(get(TOKEN).status, 429)  # lockout applies even to the right token
        finally:
            server.shutdown(); server.server_close()


class CreateLimitTests(unittest.TestCase):
    def test_creation_rate_limit(self):
        config = Config(host="127.0.0.1", port=0, db_path=":memory:", token=TOKEN, create_limit=2)
        server = create_server(LinkService(Storage(":memory:")), config)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        port = server.server_address[1]

        def post(i):
            c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            c.request("POST", "/api/links", json.dumps({"url": f"https://a.com/{i}"}),
                      {"Authorization": f"Bearer {TOKEN}"})
            r = c.getresponse(); r.read(); c.close()
            return r

        try:
            self.assertEqual([post(i).status for i in range(2)], [201, 201])
            r = post(3)
            self.assertEqual(r.status, 429)
            self.assertGreaterEqual(int(r.getheader("Retry-After")), 1)
        finally:
            server.shutdown(); server.server_close()


class ProbeApiTests(unittest.TestCase):
    """Server-side probing endpoints, against a local site (allow_private) and with the SSRF guard on."""

    @classmethod
    def setUpClass(cls):
        from http.server import ThreadingHTTPServer
        from tests.test_probe import SiteHandler
        cls.site = ThreadingHTTPServer(("127.0.0.1", 0), SiteHandler)
        threading.Thread(target=cls.site.serve_forever, daemon=True).start()
        cls.site_url = f"http://127.0.0.1:{cls.site.server_port}"

        def start(**kw):
            cfg = Config(host="127.0.0.1", port=0, db_path=":memory:", token=TOKEN, auth_fail_limit=1000, **kw)
            srv = create_server(LinkService(Storage(":memory:")), cfg)
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            return srv
        cls.open_srv, cls.guarded = start(probe_allow_private=True), start()

    @classmethod
    def tearDownClass(cls):
        for s in (cls.site, cls.open_srv, cls.guarded):
            s.shutdown()
            s.server_close()

    def call(self, srv, path, body, token=TOKEN):
        c = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=10)
        c.request("POST", path, json.dumps(body), {"Authorization": f"Bearer {token}"} if token else {})
        r = c.getresponse()
        raw = r.read()
        c.close()
        return r.status, json.loads(raw) if raw else None

    def test_trace_requires_auth_and_validates(self):
        self.assertEqual(self.call(self.open_srv, "/api/tools/trace", {"url": self.site_url}, token=None)[0], 401)
        self.assertEqual(self.call(self.open_srv, "/api/tools/trace", {})[0], 400)
        self.assertEqual(self.call(self.open_srv, "/api/tools/trace", {"url": 5})[0], 400)

    def test_trace_follows_redirects(self):
        status, r = self.call(self.open_srv, "/api/tools/trace", {"url": self.site_url + "/a"})
        self.assertEqual(status, 200)
        self.assertEqual((r["ok"], [h["status"] for h in r["hops"]], r["final"]["title"]), (True, [302, 301, 200], "Hello World"))

    def test_guard_blocks_internal_targets_by_default(self):
        for url in (self.site_url + "/", "http://127.0.0.1:8080/", "http://169.254.169.254/latest/meta-data/", "http://localhost/", "http://[::1]/"):
            with self.subTest(url=url):
                status, r = self.call(self.guarded, "/api/tools/trace", {"url": url})
                self.assertEqual(status, 200)
                self.assertFalse(r["ok"])
                self.assertEqual(r["hops"], [])  # nothing was requested
                self.assertTrue(r["error"])

    def test_check_links_batch(self):
        for slug, path in (("okpage", "/c"), ("deadpg", "/missing"), ("redir1", "/a")):
            self.call(self.open_srv, "/api/links", {"url": self.site_url + path, "slug": slug})
        status, body = self.call(self.open_srv, "/api/links/check", {"slugs": ["okpage", "deadpg", "redir1", "nosuch"]})
        self.assertEqual(status, 200)
        res = {r["slug"]: r for r in body["results"]}
        self.assertTrue(res["okpage"]["ok"]); self.assertTrue(res["redir1"]["ok"])
        self.assertEqual((res["deadpg"]["ok"], res["deadpg"]["status"]), (False, 404))
        self.assertEqual(res["nosuch"]["error"], "not found")
        self.assertEqual([r["slug"] for r in body["results"]], ["okpage", "deadpg", "redir1", "nosuch"])  # order kept

    def test_check_validation_and_auth(self):
        self.assertEqual(self.call(self.open_srv, "/api/links/check", {"slugs": []})[0], 400)
        self.assertEqual(self.call(self.open_srv, "/api/links/check", {"slugs": ["a"] * 26})[0], 400)
        self.assertEqual(self.call(self.open_srv, "/api/links/check", {"slugs": [1]})[0], 400)
        self.assertEqual(self.call(self.open_srv, "/api/links/check", {"slugs": ["a"]}, token=None)[0], 401)

    def test_probe_rate_limit(self):
        cfg = Config(host="127.0.0.1", port=0, db_path=":memory:", token=TOKEN, probe_limit=3, probe_allow_private=True)
        srv = create_server(LinkService(Storage(":memory:")), cfg)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            codes = [self.call(srv, "/api/tools/trace", {"url": self.site_url + "/c"})[0] for _ in range(4)]
            self.assertEqual(codes, [200, 200, 200, 429])
        finally:
            srv.shutdown(); srv.server_close()
