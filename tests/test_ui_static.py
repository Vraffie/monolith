"""The packaged web UI is served from an allow-list and with a strict CSP."""

import http.client
import threading
import unittest

from hitchly.config import Config
from hitchly.service import LinkService
from hitchly.storage import Storage
from hitchly.web import create_server


class StaticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = create_server(LinkService(Storage(":memory:")),
                                   Config(host="127.0.0.1", port=0, db_path=":memory:", token="t"))
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def get(self, path, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("GET", path, headers=headers or {})
        r = c.getresponse()
        body = r.read()
        c.close()
        return r.status, body, r

    def test_index_and_assets_have_strict_csp(self):
        for path, ctype in [("/", "text/html"), ("/ui/app.js", "text/javascript"), ("/ui/app.css", "text/css"),
                            ("/ui/tools/links.js", "text/javascript"), ("/ui/dom.js", "text/javascript")]:
            with self.subTest(path=path):
                status, body, r = self.get(path)
                self.assertEqual(status, 200)
                self.assertTrue(r.getheader("Content-Type").startswith(ctype))
                csp = r.getheader("Content-Security-Policy")
                self.assertIn("script-src 'self'", csp)
                self.assertNotIn("unsafe-inline", csp)  # no inline script or style anywhere
                self.assertIn("frame-ancestors 'none'", csp)
                self.assertTrue(body)

    def test_html_has_no_inline_script_or_style(self):
        _, body, _ = self.get("/")
        html = body.decode().lower()
        self.assertNotIn("<style", html)
        self.assertNotIn(" style=", html)
        self.assertNotIn("onclick=", html)
        for tag in html.split("<script")[1:]:
            self.assertIn("src=", tag.split(">")[0])

    def test_etag_revalidation(self):
        _, _, r = self.get("/ui/app.js")
        etag = r.getheader("ETag")
        status, body, _ = self.get("/ui/app.js", {"If-None-Match": etag})
        self.assertEqual((status, body), (304, b""))

    def test_gzip_negotiation_and_revalidation(self):
        import gzip
        _, plain, r0 = self.get("/ui/app.js")
        self.assertIsNone(r0.getheader("Content-Encoding"))
        status, body, r = self.get("/ui/app.js", {"Accept-Encoding": "gzip, deflate"})
        self.assertEqual((status, r.getheader("Content-Encoding"), r.getheader("Vary")), (200, "gzip", "Accept-Encoding"))
        self.assertEqual(gzip.decompress(body), plain)          # same bytes after decoding
        self.assertLess(len(body), len(plain) * 0.6)
        etag = r.getheader("ETag")
        self.assertNotEqual(etag, r0.getheader("ETag"))          # distinct validator per representation
        self.assertEqual(self.get("/ui/app.js", {"Accept-Encoding": "gzip", "If-None-Match": etag})[0], 304)
        self.assertEqual(self.get("/ui/app.js", {"Accept-Encoding": "identity"})[2].getheader("Content-Encoding"), None)
        # tiny or non-text files are never compressed
        self.assertIsNone(self.get("/ui/favicon.svg", {"Accept-Encoding": "gzip"})[2].getheader("Content-Encoding"))

    def test_path_traversal_and_disallowed_files(self):
        for path in ["/ui/../web.py", "/ui/%2e%2e/web.py", "/ui/tools/../../web.py", "/ui/..%2fweb.py",
                     "/ui/%2e%2e%2fconfig.py", "/ui/app.py", "/ui/", "/ui/nope.js", "/ui/a/b/c/d.js",
                     "/ui//etc/passwd", "/ui/tools", "/ui/.hidden.js", "/ui/app.js/..", "/ui/tools\\links.js"]:
            with self.subTest(path=path):
                self.assertEqual(self.get(path)[0], 404)

    def test_ui_is_a_reserved_slug(self):
        from hitchly.domain import ValidationError, validate_slug
        with self.assertRaises(ValidationError):
            validate_slug("ui")


if __name__ == "__main__":
    unittest.main()
