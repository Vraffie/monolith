"""A tiny local website (redirects, 404s, a titled page) for browser tests of the tracer and dead-link checker.

    python tests/e2e/site.py 8087
"""
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tests.test_probe import SiteHandler  # noqa: E402

ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8087), SiteHandler).serve_forever()
