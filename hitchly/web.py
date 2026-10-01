"""HTTP adapter: routing, auth, JSON (de)serialisation. Stdlib only."""

from __future__ import annotations

import csv
import hmac
import io
import json
from datetime import datetime, timezone
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
from urllib.parse import parse_qs, urlsplit

from . import __version__, qr
from .config import Config
from .ratelimit import RateLimiter
from .domain import Conflict, Link, NotFound, ValidationError
from .service import LinkService

MAX_BODY = 8 * 1024
SLUG_PATH = re.compile(r"^/([A-Za-z0-9_-]{1,64})$")
API_LINK = re.compile(r"^/api/links/([A-Za-z0-9_-]{1,64})$")
API_CLICKS = re.compile(r"^/api/links/([A-Za-z0-9_-]{1,64})/clicks\.csv$")
API_QR = re.compile(r"^/api/links/([A-Za-z0-9_-]{1,64})/qr\.svg$")
API_STATS = re.compile(r"^/api/links/([A-Za-z0-9_-]{1,64})/stats$")
CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:"


def _int_param(qs: dict, name: str, default: int) -> int:
    try:
        return int(qs.get(name, [default])[0])
    except ValueError:
        raise ValidationError(f"{name} must be an integer") from None


def _csv_safe(value: str | None) -> str:
    """Neutralise spreadsheet formula injection: referrer/UA are attacker-controlled."""
    value = value or ""
    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


def make_handler(service: LinkService, config: Config):
    auth_failures = RateLimiter(max(1, config.auth_fail_limit), 60)
    creations = RateLimiter(config.create_limit, 60) if config.create_limit > 0 else None

    class Handler(BaseHTTPRequestHandler):
        server_version = f"Hitchly/{__version__}"
        protocol_version = "HTTP/1.1"

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

        def _read_json(self) -> dict:
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise ValidationError("invalid Content-Length") from None
            if length > MAX_BODY:
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
                html = resources.files("hitchly").joinpath("ui.html").read_bytes()
                return self._send(200, html, "text/html; charset=utf-8", {"Content-Security-Policy": CSP})
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
                target = service.resolve(m.group(1), self.headers.get("Referer"), self.headers.get("User-Agent"),
                                         head=self.command == "HEAD")
                if target is None:
                    return self._send(410, b"This link is no longer available.\n", "text/plain; charset=utf-8")
                return self._send(302, b"", headers={"Location": target, "Cache-Control": "no-store"})
            self._error(404, "not found")

        def _post(self):
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
                                  body.get("max_visits"))
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


def create_server(service: LinkService, config: Config) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((config.host, config.port), make_handler(service, config))
