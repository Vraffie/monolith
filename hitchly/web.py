"""HTTP adapter: routing, auth, JSON (de)serialisation. Stdlib only."""

from __future__ import annotations

import csv
from concurrent.futures import ThreadPoolExecutor
import gzip
import hashlib
import hmac
import threading
import io
import os
import tempfile
import json
from datetime import datetime, timezone
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
from urllib.parse import parse_qs, urlsplit

from . import __version__, qr
from .config import Config
from .probe import Prober
from .ratelimit import RateLimiter
from .domain import Conflict, Link, NotFound, PasswordRequired, ValidationError
from .service import LinkService

MAX_BODY = 8 * 1024
MAX_BULK_BODY = 1024 * 1024
MAX_BULK_ITEMS = 500
SLUG_PATH = re.compile(r"^/([A-Za-z0-9_-]{1,64})$")
API_LINK = re.compile(r"^/api/links/([A-Za-z0-9_-]{1,64})$")
API_CLICKS = re.compile(r"^/api/links/([A-Za-z0-9_-]{1,64})/clicks\.csv$")
API_QR = re.compile(r"^/api/links/([A-Za-z0-9_-]{1,64})/qr\.svg$")
API_STATS = re.compile(r"^/api/links/([A-Za-z0-9_-]{1,64})/stats$")
CSP = ("default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; "
       "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
STATIC_TYPES = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
                ".svg": "image/svg+xml", ".json": "application/json", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"}
_GZIP_CACHE: dict[str, bytes] = {}  # etag -> compressed bytes; a few dozen small files at most
COMPRESSIBLE = {".js", ".css", ".html", ".svg", ".json", ".txt"}
STATIC_PART = re.compile(r"^[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)?$")


def _int_param(qs: dict, name: str, default: int) -> int:
    try:
        return int(qs.get(name, [default])[0])
    except ValueError:
        raise ValidationError(f"{name} must be an integer") from None


FORM_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
FORM_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Protected link</title><style>
body{{font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7f7f5;color:#1c1c1a}}
@media(prefers-color-scheme:dark){{body{{background:#161616;color:#eee}}input{{background:#222;color:#eee}}}}
form{{width:min(92vw,340px)}}h1{{font-size:1.2rem}}input,button{{width:100%;box-sizing:border-box;padding:10px;font:inherit;margin-top:8px;
border-radius:6px;border:1px solid #8884}}button{{background:#2f5bea;color:#fff;border-color:#2f5bea;cursor:pointer}}.err{{color:#c0392b}}
</style></head><body><form method="post" autocomplete="off"><h1>This link is password protected</h1>{error}
<label for="p">Password</label><input id="p" name="password" type="password" required autofocus maxlength="128">
<button>Continue</button></form></body></html>"""


def _csv_safe(value: str | None) -> str:
    """Neutralise spreadsheet formula injection: referrer/UA are attacker-controlled."""
    value = value or ""
    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


def make_handler(service: LinkService, config: Config, prober: Prober | None = None):
    prober = prober or Prober(allow_private=config.probe_allow_private)
    probes = RateLimiter(config.probe_limit, 60) if config.probe_limit > 0 else None
    auth_failures = RateLimiter(max(1, config.auth_fail_limit), 60)
    creations = RateLimiter(config.create_limit, 60) if config.create_limit > 0 else None
    password_failures = RateLimiter(max(1, config.auth_fail_limit), 60)  # keyed by client + slug

    class Handler(BaseHTTPRequestHandler):
        server_version = f"Hitchly/{__version__}"
        protocol_version = "HTTP/1.1"
        # Send headers and body in ONE TCP segment and disable Nagle: without this every response with a body stalled ~40 ms
        # (Nagle + delayed ACK). handle_one_request() flushes the buffer after each request.
        wbufsize = 64 * 1024
        disable_nagle_algorithm = True
        # Drop clients that stall (slowloris) and idle keep-alive connections instead of holding a thread forever.
        timeout = 10

        # ---- helpers -------------------------------------------------
        def log_message(self, fmt, *args):  # quieter, single-line access log
            print(f"{self.address_string()} {fmt % args}", flush=True)

        def _origin(self) -> str:
            return config.base_url or f"http://{self.headers.get('Host', 'localhost')}"

        def _send(self, status: int, body: bytes = b"", ctype: str = "application/json", headers: dict | None = None):
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            for k, v in (headers or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, status: int, payload, headers: dict | None = None):
            self._send(status, json.dumps(payload).encode(), headers=headers)

        def _error(self, status: int, message: str, headers: dict | None = None):
            self._json(status, {"error": message}, headers)

        def _authorized(self) -> bool:
            header = self.headers.get("Authorization", "")
            supplied = header[7:] if header.startswith("Bearer ") else ""
            return hmac.compare_digest(supplied.encode(), config.token.encode())

        def _read_json(self, max_body: int = MAX_BODY) -> dict:
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise ValidationError("invalid Content-Length") from None
            if length > max_body:
                self.close_connection = True  # body left unread; don't parse it as the next request
                raise ValidationError("request body too large")
            try:
                data = json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                raise ValidationError("body must be valid JSON") from None
            if not isinstance(data, dict):
                raise ValidationError("body must be a JSON object")
            return data

        def _link_json(self, link: Link) -> dict:
            return {
                "slug": link.slug,
                "short_url": f"{self._origin()}/{link.slug}",
                "url": link.url,
                "created_at": link.created_at,
                "expires_at": link.expires_at,
                "expired": link.is_expired(service.clock()),
                "clicks": link.clicks,
                "bot_clicks": link.bot_clicks,
                "tags": list(link.tags),
                "max_visits": link.max_visits,
                "exhausted": link.exhausted,
                "protected": bool(link.password_hash),
            }

        def _dispatch(self, fn):
            try:
                fn()
            except ValidationError as e:
                self._error(400, str(e))
            except Conflict:
                self._error(409, "slug already in use")
            except NotFound:
                self._error(404, "not found")
            except Exception as e:  # pragma: no cover - last resort
                print(f"internal error: {e!r}", flush=True)
                self._error(500, "internal error")

        def _client_ip(self) -> str:
            if config.trust_proxy:
                forwarded = self.headers.get("X-Forwarded-For", "")
                if forwarded:
                    return forwarded.split(",")[-1].strip()  # last hop = added by our own proxy
            return self.client_address[0]

        def _require_auth(self) -> bool:
            ip = self._client_ip()
            self.close_connection = True  # a POST body may be unread on any early return below
            wait = auth_failures.blocked_for(ip)
            if wait:
                self._error(429, "too many failed attempts", {"Retry-After": str(int(wait) + 1)})
                return False
            if self._authorized():
                self.close_connection = False
                return True
            auth_failures.record(ip)
            self._error(401, "missing or invalid token", {"WWW-Authenticate": "Bearer"})
            return False

        # ---- verbs ---------------------------------------------------
        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            self._dispatch(self._get)

        def do_POST(self):
            self._dispatch(self._post)

        def do_PATCH(self):
            self._dispatch(self._patch)

        def do_DELETE(self):
            self._dispatch(self._delete)

        def _get(self):
            parts = urlsplit(self.path)
            path, qs = parts.path, parse_qs(parts.query)

            if path == "/":
                return self._static("index.html")
            if path.startswith("/ui/"):
                return self._static(path[4:])
            if path == "/health":
                return self._json(200, {"status": "ok", "version": __version__})
            if path == "/metrics":
                if not self._require_auth():
                    return
                t = service.totals()
                body = (
                    "# HELP hitchly_links Links currently stored.\n# TYPE hitchly_links gauge\n"
                    f"hitchly_links {t['links']}\n"
                    "# HELP hitchly_links_expired Stored links past their expiry (purge to remove).\n"
                    "# TYPE hitchly_links_expired gauge\n"
                    f"hitchly_links_expired {t['expired_links']}\n"
                    "# HELP hitchly_clicks_total Human redirects (bots excluded).\n# TYPE hitchly_clicks_total counter\n"
                    f"hitchly_clicks_total {t['clicks']}\n"
                    "# HELP hitchly_bot_clicks_total Redirects classified as bots.\n"
                    "# TYPE hitchly_bot_clicks_total counter\n"
                    f"hitchly_bot_clicks_total {t['bot_clicks']}\n"
                ).encode()
                return self._send(200, body, "text/plain; version=0.0.4; charset=utf-8")
            if path == "/api/overview":
                if not self._require_auth():
                    return
                return self._json(200, {**service.totals(), "version": __version__, "schema_version": service.storage.schema_version,
                                        "probes_allow_private": config.probe_allow_private})
            if path == "/api/backup":
                return self._backup()
            if path == "/api/links":
                if not self._require_auth():
                    return
                links, total = service.list(_int_param(qs, "limit", 50), _int_param(qs, "offset", 0),
                                            qs.get("tag", [None])[0], qs.get("q", [None])[0])
                return self._json(200, {"total": total, "links": [self._link_json(l) for l in links]})
            if m := API_QR.match(path):
                if not self._require_auth():
                    return
                link = service.get(m.group(1))
                try:
                    svg = qr.to_svg(f"{self._origin()}/{link.slug}", scale=_int_param(qs, "scale", 8))
                except qr.QRTooLong:
                    raise ValidationError("short URL too long for a QR code") from None
                return self._send(200, svg.encode(), "image/svg+xml")
            if m := API_CLICKS.match(path):
                if not self._require_auth():
                    return
                slug = m.group(1)
                out = io.StringIO()
                w = csv.writer(out)
                w.writerow(["timestamp_utc", "referrer", "user_agent", "bot"])
                for ts, ref, ua, bot in service.export_clicks(slug):
                    iso = datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                    w.writerow([iso, _csv_safe(ref), _csv_safe(ua), int(bot)])
                return self._send(200, out.getvalue().encode(), "text/csv; charset=utf-8",
                                  {"Content-Disposition": f'attachment; filename="{slug}-clicks.csv"'})
            if m := API_STATS.match(path):
                if not self._require_auth():
                    return
                return self._json(200, service.stats(m.group(1), _int_param(qs, "days", 7),
                                                     include_bots=qs.get("include_bots", ["0"])[0] in ("1", "true")))
            if m := API_LINK.match(path):
                if not self._require_auth():
                    return
                return self._json(200, self._link_json(service.get(m.group(1))))
            if path.startswith("/api/"):
                return self._error(404, "not found")
            if m := SLUG_PATH.match(path):
                return self._redirect(m.group(1), password=None)
            self._error(404, "not found")

        def _static(self, rel: str):
            """Serve a packaged UI file. Allow-list: simple names, known extensions, at most 2 levels deep."""
            parts = rel.split("/")
            ext = "." + parts[-1].rsplit(".", 1)[-1].lower() if "." in parts[-1] else ""
            if len(parts) > 3 or not all(STATIC_PART.match(p) for p in parts) or ext not in STATIC_TYPES:
                return self._error(404, "not found")
            node = resources.files("hitchly").joinpath("ui", *parts)
            if not node.is_file():
                return self._error(404, "not found")
            data = node.read_bytes()
            etag = '"' + hashlib.sha1(data).hexdigest()[:20] + '"'
            headers = {"ETag": etag, "Cache-Control": "no-cache", "Content-Security-Policy": CSP, "Vary": "Accept-Encoding"}
            if ext in COMPRESSIBLE and len(data) > 512 and "gzip" in self.headers.get("Accept-Encoding", "").lower():
                etag = etag[:-1] + '-gz"'  # a different representation needs a different validator
                if etag not in _GZIP_CACHE:
                    if len(_GZIP_CACHE) > 256:
                        _GZIP_CACHE.clear()
                    _GZIP_CACHE[etag] = gzip.compress(data, 6, mtime=0)
                data, headers["ETag"], headers["Content-Encoding"] = _GZIP_CACHE[etag], etag, "gzip"
            if self.headers.get("If-None-Match") == etag:
                return self._send(304, b"", STATIC_TYPES[ext], headers)
            self._send(200, data, STATIC_TYPES[ext], headers)

        def _redirect(self, slug: str, password: str | None):
            try:
                target = service.resolve(slug, self.headers.get("Referer"), self.headers.get("User-Agent"),
                                         head=self.command == "HEAD", password=password)
            except PasswordRequired as e:
                if e.wrong:
                    password_failures.record(f"{self._client_ip()}|{slug}")
                error = '<p class="err" role="alert">Wrong password.</p>' if e.wrong else ""
                return self._send(200, FORM_PAGE.format(error=error).encode(), "text/html; charset=utf-8",
                                  {"Content-Security-Policy": FORM_CSP, "Cache-Control": "no-store"})
            if target is None:
                return self._send(410, b"This link is no longer available.\n", "text/plain; charset=utf-8")
            # 303 so the browser follows with GET even after a form POST
            status = 303 if password is not None else 302
            return self._send(status, b"", headers={"Location": target, "Cache-Control": "no-store"})

        def _submit_password(self, slug: str):
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = -1
            if not 0 <= length <= 2048:
                self.close_connection = True
                return self._error(400, "invalid request body")
            wait = password_failures.blocked_for(f"{self._client_ip()}|{slug}")
            if wait:  # refuse before spending a scrypt computation
                self.rfile.read(length)
                return self._error(429, "too many wrong passwords, try later", {"Retry-After": str(int(wait) + 1)})
            fields = parse_qs(self.rfile.read(length).decode("utf-8", "replace"))
            self._redirect(slug, fields.get("password", [""])[0])

        def _probe_budget(self, n: int):
            """Returns an error-sending callable if the client is over its probe budget, else records n probes."""
            if not probes:
                return None
            ip = self._client_ip()
            wait = probes.blocked_for(ip)
            if wait:
                self.close_connection = True
                return lambda: self._error(429, "too many URL checks, slow down", {"Retry-After": str(int(wait) + 1)})
            for _ in range(n):
                probes.record(ip)
            return None

        def _trace(self):
            if not self._require_auth():
                return
            url = self._read_json().get("url")
            if not isinstance(url, str) or not url.strip():
                raise ValidationError("url is required")
            if (refuse := self._probe_budget(1)):
                return refuse()
            self._json(200, prober.trace(url.strip()))

        def _check_links(self):
            if not self._require_auth():
                return
            slugs = self._read_json().get("slugs")
            if not isinstance(slugs, list) or not 1 <= len(slugs) <= 25 or not all(isinstance(s, str) for s in slugs):
                raise ValidationError("slugs must be a list of 1-25 slugs")
            if (refuse := self._probe_budget(len(slugs))):
                return refuse()
            found = []
            for slug in slugs:
                try:
                    found.append((slug, service.get(slug).url))
                except NotFound:
                    found.append((slug, None))

            def run(item):
                slug, url = item
                if url is None:
                    return {"slug": slug, "ok": False, "error": "not found", "status": None}
                return {"slug": slug, "url": url, **prober.check(url)}
            with ThreadPoolExecutor(max_workers=8) as pool:
                self._json(200, {"results": list(pool.map(run, found))})

        def _bulk_create(self):
            if not self._require_auth():
                return
            items = self._read_json(MAX_BULK_BODY).get("links")
            if not isinstance(items, list) or not 1 <= len(items) <= MAX_BULK_ITEMS:
                raise ValidationError(f"links must be a list of 1-{MAX_BULK_ITEMS} objects")
            # Not subject to HITCHLY_CREATE_LIMIT (that guards single creates): bulk is token-gated and capped per request.
            results, created = [], 0
            for i, item in enumerate(items):
                try:
                    if not isinstance(item, dict):
                        raise ValidationError("each link must be an object")
                    if "password" in item:
                        raise ValidationError("passwords are not supported in bulk creation (set them per link)")
                    link = service.create(item.get("url"), item.get("slug"), item.get("ttl_seconds"), item.get("tags"),
                                          item.get("max_visits"))
                    results.append({"index": i, "link": self._link_json(link)})
                    created += 1
                except ValidationError as e:
                    results.append({"index": i, "error": str(e), "status": 400})
                except Conflict:
                    results.append({"index": i, "error": "slug already in use", "status": 409})
            self._json(200, {"created": created, "failed": len(items) - created, "results": results})

        def _purge(self):
            if not self._require_auth():
                return
            self._read_json()  # drain the body (may be empty)
            self._json(200, {"removed": service.purge_expired()})

        def _backup(self):
            if not self._require_auth():
                return
            fd, tmp = tempfile.mkstemp(suffix=".db")
            os.close(fd)
            try:
                os.unlink(tmp)  # sqlite creates it fresh
                service.storage.backup(tmp)
                with open(tmp, "rb") as f:
                    data = f.read()
            except RuntimeError as e:  # e.g. in-memory database
                raise ValidationError(str(e)) from None
            finally:
                if os.path.exists(tmp):
                    os.unlink(tmp)
            self._send(200, data, "application/vnd.sqlite3",
                       {"Content-Disposition": 'attachment; filename="hitchly-backup.db"', "Cache-Control": "no-store"})

        def _post(self):
            path = urlsplit(self.path).path
            if path == "/api/links/bulk":
                return self._bulk_create()
            if path == "/api/purge":
                return self._purge()
            if path == "/api/tools/trace":
                return self._trace()
            if path == "/api/links/check":
                return self._check_links()
            if (m := SLUG_PATH.match(path)):
                return self._submit_password(m.group(1))
            if self.path != "/api/links":
                self.close_connection = True
                return self._error(404, "not found")
            if not self._require_auth():
                return
            if creations:
                ip = self._client_ip()
                wait = creations.blocked_for(ip)
                if wait:
                    self.close_connection = True
                    return self._error(429, "too many links created, slow down", {"Retry-After": str(int(wait) + 1)})
            body = self._read_json()
            link = service.create(body.get("url"), body.get("slug"), body.get("ttl_seconds"), body.get("tags"),
                                  body.get("max_visits"), body.get("password"))
            if creations:
                creations.record(self._client_ip())
            self._json(201, self._link_json(link), {"Location": f"/api/links/{link.slug}"})

        def _patch(self):
            m = API_LINK.match(urlsplit(self.path).path)
            if not m:
                self.close_connection = True
                return self._error(404, "not found")
            if not self._require_auth():
                return
            link = service.update(m.group(1), self._read_json())
            self._json(200, self._link_json(link))

        def _delete(self):
            m = API_LINK.match(urlsplit(self.path).path)
            if not m:
                return self._error(404, "not found")
            if not self._require_auth():
                return
            service.delete(m.group(1))
            self._send(204)

    return Handler


class _Server(ThreadingHTTPServer):
    """Thread-per-connection server with a real listen backlog and a cap on concurrent threads.

    The stdlib default backlog is 5, which drops connections (and costs the client a 1-3 s SYN retry) under any burst.
    Past MAX_THREADS the accept loop blocks, so extra connections wait in the kernel queue instead of exhausting memory.
    """

    request_queue_size = 512
    daemon_threads = True
    MAX_THREADS = 512

    def __init__(self, *args, **kwargs):
        self._slots = threading.BoundedSemaphore(self.MAX_THREADS)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        self._slots.acquire()
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()


def create_server(service: LinkService, config: Config, prober: Prober | None = None) -> ThreadingHTTPServer:
    return _Server((config.host, config.port), make_handler(service, config, prober))
