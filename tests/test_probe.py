import socket
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest import mock

from hitchly import probe
from hitchly.probe import BlockedTarget, Prober, ip_is_blocked, page_info


class SiteHandler(BaseHTTPRequestHandler):
    """A tiny site with redirects, errors and a title, for probing over real sockets."""

    def log_message(self, *a):
        pass

    def _send(self, status, body=b"", ctype="text/html", headers=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        p = self.path
        if p == "/a":
            self._send(302, headers={"Location": "/b"})
        elif p == "/b":
            self._send(301, headers={"Location": f"http://127.0.0.1:{self.server.server_port}/c?x=1"})
        elif p == "/c" or p.startswith("/c?"):
            self._send(200, b"<html><head><title>  Hello\n  World </title><meta name='description' content='A page'></head></html>")
        elif p == "/loop1":
            self._send(302, headers={"Location": "/loop2"})
        elif p == "/loop2":
            self._send(302, headers={"Location": "/loop1"})
        elif p == "/missing":
            self._send(404, b"nope")
        elif p == "/ftp":
            self._send(302, headers={"Location": "ftp://example.com/x"})
        elif p == "/nohead":
            self._send(405 if self.command == "HEAD" else 200, b"ok")
        elif p == "/json":
            self._send(200, b'{"a":1}', "application/json")
        elif p.startswith("/chain/"):
            n = int(p.split("/")[2])
            self._send(302, headers={"Location": f"/chain/{n + 1}"})
        else:
            self._send(200, b"<title>root</title>")


class ProbeCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), SiteHandler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.local = Prober(allow_private=True, timeout=3)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()


class IpTests(unittest.TestCase):
    def test_blocked_and_allowed_addresses(self):
        for ip in ["127.0.0.1", "127.1.2.3", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1",
                   "0.0.0.0", "224.0.0.1", "240.0.0.1", "192.0.2.1", "::1", "::", "fe80::1", "fc00::1", "fd12::1",
                   "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "2002:7f00:1::", "2002:a00:1::", "64:ff9b::a00:1"]:
            with self.subTest(ip=ip):
                self.assertTrue(ip_is_blocked(ip))
        for ip in ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"]:
            with self.subTest(ip=ip):
                self.assertFalse(ip_is_blocked(ip))


class ValidationTests(unittest.TestCase):
    def prober(self, ips, **kw):
        return Prober(resolver=lambda host, port: ips, **kw)

    def test_scheme_credentials_port_and_malformed(self):
        p = self.prober(["93.184.216.34"])
        for url, msg in [("ftp://example.com/", "Only http"), ("file:///etc/passwd", "Only http"), ("javascript:alert(1)", "Only http"),
                         ("https://user:pw@example.com/", "credentials"), ("http://example.com:22/", "Port 22"),
                         ("http://example.com:6379/", "Port 6379"), ("http://[::1", "malformed"), ("http:///path", "no host"),
                         ("http://example.com:99999/", "malformed")]:
            with self.subTest(url=url), self.assertRaisesRegex(BlockedTarget, msg):
                p.validate(url)
        self.assertEqual(p.validate("https://example.com/a?b=1").port, 443)
        self.assertEqual(p.validate("http://example.com:8080/").port, 8080)
        self.assertEqual(p.validate("http://example.com").path, "/")

    def test_private_resolution_blocked_even_when_mixed(self):
        for ips in (["10.0.0.5"], ["127.0.0.1"], ["8.8.8.8", "10.0.0.5"], ["::1"], ["169.254.169.254"]):
            with self.subTest(ips=ips), self.assertRaisesRegex(BlockedTarget, "private or internal"):
                self.prober(ips).validate("http://anything.example/")
        self.assertEqual(self.prober(["8.8.8.8"]).validate("http://ok.example/").ip, "8.8.8.8")

    def test_numeric_hosts_cannot_smuggle_private_ips(self):
        # The system resolver turns these into 127.0.0.1; whatever form is used, the RESOLVED address is judged.
        real = Prober()
        for host in ["http://2130706433/", "http://0x7f000001/", "http://017700000001/", "http://127.1/", "http://localhost/",
                     "http://[::ffff:7f00:1]/", "http://0/"]:
            with self.subTest(host=host), self.assertRaises(BlockedTarget):
                real.validate(host)

    def test_resolution_failure(self):
        def boom(host, port):
            raise socket.gaierror("nope")
        with self.assertRaisesRegex(BlockedTarget, "resolve"):
            Prober(resolver=boom).validate("http://nonexistent.invalid/")

    def test_allow_private_opt_in(self):
        self.assertEqual(Prober(allow_private=True, resolver=lambda h, p: ["10.0.0.5"]).validate("http://intranet:3000/").port, 3000)


class SsrfTests(unittest.TestCase):
    def test_connection_is_pinned_to_the_validated_ip(self):
        """DNS rebinding: the resolver answers differently on the second call. We must never ask again."""
        answers = iter([["93.184.216.34"], ["127.0.0.1"], ["127.0.0.1"]])
        p = Prober(resolver=lambda h, port: next(answers))
        connected = []

        def fake_connect(addr, timeout=None, *a, **k):
            connected.append(addr)
            raise ConnectionRefusedError()
        with mock.patch("socket.create_connection", fake_connect):
            r = p.trace("http://rebind.example/")
        self.assertEqual(connected, [("93.184.216.34", 80)])  # the validated public IP, not the hostname, not 127.0.0.1
        self.assertEqual(r["error"], "Connection refused")

    def test_redirect_into_internal_network_is_blocked_mid_chain(self):
        p = Prober(resolver=lambda h, port: ["169.254.169.254"] if h == "169.254.169.254" else ["93.184.216.34"])
        calls = []

        def fake_fetch(target, method, read_body):
            calls.append(target.host)
            return {"status": 302, "headers": {"location": "http://169.254.169.254/latest/meta-data/"}, "body": b"", "ms": 1}
        with mock.patch.object(p, "_fetch", fake_fetch):
            r = p.trace("http://public.example/")
        self.assertEqual(calls, ["public.example"])  # the metadata address was never contacted
        self.assertIn("private or internal", r["error"])
        self.assertFalse(r["ok"])

    def test_default_prober_refuses_local_server(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), SiteHandler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            r = Prober().trace(f"http://127.0.0.1:{server.server_port}/")
            self.assertFalse(r["ok"])
            self.assertEqual(r["hops"], [])  # nothing was requested
            self.assertIn("not allowed", r["error"] + " not allowed")  # port or private: either way refused
        finally:
            server.shutdown()
            server.server_close()


class TraceTests(ProbeCase):
    def test_follows_redirect_chain_and_reads_title(self):
        r = self.local.trace(self.base + "/a")
        self.assertTrue(r["ok"])
        self.assertEqual([h["status"] for h in r["hops"]], [302, 301, 200])
        self.assertEqual(r["hops"][1]["location"], f"{self.base}/c?x=1")
        self.assertEqual(r["final"]["url"], f"{self.base}/c?x=1")
        self.assertEqual((r["final"]["title"], r["final"]["description"]), ("Hello World", "A page"))
        self.assertTrue(all(h["ip"] == "127.0.0.1" for h in r["hops"]))

    def test_loop_404_nonweb_scheme_and_too_many_hops(self):
        self.assertEqual(self.local.trace(self.base + "/loop1")["error"], "Redirect loop")
        r = self.local.trace(self.base + "/missing")
        self.assertEqual((r["ok"], r["error"], r["final"]["status"]), (False, "HTTP 404", 404))
        self.assertEqual(self.local.trace(self.base + "/ftp")["error"], "Redirects to a non-web address")
        self.assertIn("More than 10 redirects", self.local.trace(self.base + "/chain/0")["error"])

    def test_non_html_has_no_title_and_refused_connection(self):
        r = self.local.trace(self.base + "/json")
        self.assertEqual((r["ok"], r["final"]["title"]), (True, ""))
        s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
        self.assertEqual(self.local.trace(f"http://127.0.0.1:{port}/")["error"], "Connection refused")

    def test_check_uses_head_with_get_fallback(self):
        self.assertTrue(self.local.check(self.base + "/nohead")["ok"])  # HEAD -> 405 -> GET -> 200
        c = self.local.check(self.base + "/a")
        self.assertEqual((c["ok"], c["status"], c["hops"]), (True, 200, 3))
        self.assertEqual(self.local.check(self.base + "/missing")["status"], 404)
        self.assertFalse(self.local.check(self.base + "/missing")["ok"])


class PageInfoTests(unittest.TestCase):
    def test_title_and_og(self):
        self.assertEqual(page_info(b"<title>A &amp; B</title>", "text/html")["title"], "A & B")
        info = page_info(b"<meta property='og:title' content='OG'><title>Plain</title><meta property='og:description' content='D'>", "text/html")
        self.assertEqual((info["title"], info["description"]), ("OG", "D"))
        self.assertEqual(page_info(b"<title>x</title>", "application/json"), {"title": "", "description": ""})
        self.assertEqual(page_info(b"<title>" + b"x" * 1000, "text/html")["title"], "x" * 200)
        self.assertEqual(page_info(b"\xff\xfe<<<title>ok", "text/html")["title"], "ok")  # garbage in, no crash


if __name__ == "__main__":
    unittest.main()
