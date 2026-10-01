"""End-to-end tests against a real server on an ephemeral port."""

import http.client
import json
import threading
import unittest

from shortener.config import Config
from shortener.service import LinkService
from shortener.storage import Storage
from shortener.web import create_server

TOKEN = "test-token"


class NoRedirect(http.client.HTTPConnection):
    pass


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.now = 1_700_000_000
        config = Config(host="127.0.0.1", port=0, db_path=":memory:", token=TOKEN)
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

        status, _, res = self.request("GET", "/life", token=None, headers={"Referer": "https://ref.example/"})
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
