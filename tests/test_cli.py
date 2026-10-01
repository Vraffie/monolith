"""hitch end to end: real CLI code against a real in-process server."""

import argparse
import io
import json
import os
import tempfile
import threading
import unittest

from hitchctl.cli import main, parse_duration
from hitchly.config import Config
from hitchly.service import LinkService
from hitchly.storage import Storage
from hitchly.web import create_server


class DurationTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual([parse_duration(x) for x in ("90", "30s", "15m", "2h", "7d", "1w")],
                         [90, 30, 900, 7200, 604800, 604800])
        for bad in ("", "0", "-5", "1y", "abc", "1.5h"):
            with self.assertRaises(argparse.ArgumentTypeError):
                parse_duration(bad)


class CliTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = create_server(LinkService(Storage(":memory:")),
                                   Config(host="127.0.0.1", port=0, db_path=":memory:", token="tok"))
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def ctl(self, *args, token="tok"):
        out, err = io.StringIO(), io.StringIO()
        code = main(["--url", self.base, "--token", token, *args], out, err)
        return code, out.getvalue(), err.getvalue()

    def test_new_get_edit_rm(self):
        code, out, _ = self.ctl("new", "https://example.com", "--slug", "cli-a", "--ttl", "2h")
        self.assertEqual((code, out.strip()), (0, f"{self.base}/cli-a"))
        self.assertEqual(json.loads(self.ctl("get", "cli-a")[1])["url"], "https://example.com")
        self.assertEqual(self.ctl("edit", "cli-a", "--target", "https://b.com", "--no-expiry")[0], 0)
        got = json.loads(self.ctl("get", "cli-a")[1])
        self.assertEqual((got["url"], got["expires_at"]), ("https://b.com", None))
        self.assertEqual(self.ctl("edit", "cli-a")[0], 2)
        self.assertEqual(self.ctl("rm", "cli-a", "-y")[0], 0)
        code, _, err = self.ctl("get", "cli-a")
        self.assertEqual(code, 1)
        self.assertIn("not found", err)

    def test_errors_and_missing_token(self):
        self.assertEqual(self.ctl("ls", token="bad")[0], 1)
        self.assertEqual(self.ctl("ls", token="")[0], 2)
        code, _, err = self.ctl("new", "ftp://x")
        self.assertEqual(code, 1)
        self.assertIn("error:", err)

    def test_ls_stats_clicks_export(self):
        self.ctl("new", "https://example.com", "--slug", "cli-ls")
        self.assertIn("cli-ls", self.ctl("ls")[1])
        self.assertTrue(any(l["slug"] == "cli-ls" for l in json.loads(self.ctl("ls", "--json")[1])))
        self.assertIn("0 visits (+0 bot)", self.ctl("stats", "cli-ls")[1])
        self.assertTrue(self.ctl("clicks", "cli-ls")[1].startswith("timestamp_utc"))
        self.assertIn("cli-ls", self.ctl("export", "--format", "csv")[1])
        self.assertTrue(any(l["slug"] == "cli-ls" for l in json.loads(self.ctl("export")[1])))

    def test_import_csv_with_failures_and_skips(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "in.csv")
            with open(path, "w") as f:
                f.write("url,slug,ttl_seconds\nhttps://a.com,imp-1,60\nhttps://b.com,,\nftp://bad,imp-3,\nhttps://a.com,imp-1,\n")
            code, out, err = self.ctl("import", path, "--skip-existing")
            self.assertEqual(code, 1)  # one invalid row
            self.assertIn("2 created, 1 skipped, 1 failed", out)
            self.assertIn("row 3", err)
            jpath = os.path.join(d, "in.json")
            with open(jpath, "w") as f:
                json.dump([{"url": "https://c.com", "slug": "imp-j"}], f)
            self.assertEqual(self.ctl("import", jpath)[0], 0)

    def test_qr_to_stdout_and_file(self):
        self.ctl("new", "https://example.com", "--slug", "cli-qr")
        self.assertTrue(self.ctl("qr", "cli-qr")[1].startswith("<svg"))
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "q.svg")
            self.assertEqual(self.ctl("qr", "cli-qr", "-o", path)[0], 0)
            self.assertTrue(open(path).read().startswith("<svg"))

    def test_tags_and_search(self):
        self.ctl("new", "https://example.com/t1", "--slug", "cli-t1", "--tag", "alpha", "--tag", "beta")
        self.ctl("new", "https://example.com/t2", "--slug", "cli-t2", "--tag", "beta")
        slugs = lambda *a: {l["slug"] for l in json.loads(self.ctl("ls", "--json", *a)[1])}
        self.assertEqual(slugs("--tag", "beta") & {"cli-t1", "cli-t2"}, {"cli-t1", "cli-t2"})
        self.assertEqual(slugs("--tag", "alpha"), {"cli-t1"})
        self.assertEqual(slugs("--search", "example.com/t2"), {"cli-t2"})
        self.assertIn("alpha,beta", self.ctl("ls", "--tag", "alpha")[1])
        self.ctl("edit", "cli-t1", "--tag", "gamma")
        self.assertEqual(slugs("--tag", "gamma"), {"cli-t1"})
        self.ctl("edit", "cli-t1", "--clear-tags")
        self.assertEqual(slugs("--tag", "gamma"), set())

    def test_max_visits_flags(self):
        self.ctl("new", "https://example.com", "--slug", "cli-cap", "--max-visits", "3")
        self.assertEqual(json.loads(self.ctl("get", "cli-cap")[1])["max_visits"], 3)
        self.ctl("edit", "cli-cap", "--max-visits", "9")
        self.assertEqual(json.loads(self.ctl("get", "cli-cap")[1])["max_visits"], 9)
        self.ctl("edit", "cli-cap", "--no-max-visits")
        self.assertIsNone(json.loads(self.ctl("get", "cli-cap")[1])["max_visits"])

    def test_check_reports_dead_links(self):
        self.ctl("new", f"{self.base}/health", "--slug", "chk-ok")
        self.ctl("new", "http://127.0.0.1:1/", "--slug", "chk-dead")
        code, out, _ = self.ctl("check", "--timeout", "2")
        self.assertEqual(code, 1)
        self.assertIn("DEAD  chk-dead", out)
        self.assertNotIn("DEAD  chk-ok", out)


if __name__ == "__main__":
    unittest.main()
