"""Server-side URL probing for the redirect tracer and the dead-link checker.

Making the server fetch arbitrary URLs is a classic SSRF risk, so this module:
  * only talks http/https, refuses URLs with embedded credentials,
  * resolves the host itself and refuses private, loopback, link-local, multicast, reserved and
    carrier-grade-NAT addresses (including IPv4-mapped / 6to4 / NAT64 forms) unless explicitly allowed,
  * rejects a host if ANY of its addresses is blocked (mixed answers are a known bypass),
  * then CONNECTS TO THE VALIDATED IP, not the hostname, so DNS cannot change between check and use (rebinding),
  * never follows redirects automatically: every hop is validated again,
  * only allows ports 80, 443, 8080 and 8443 (no scanning odd ports of public hosts),
  * caps time, hops and bytes read, and sends no cookies or credentials.
"""

from __future__ import annotations

import html.parser
import http.client
import ipaddress
import socket
import ssl
import time
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

ALLOWED_PORTS = (80, 443, 8080, 8443)
USER_AGENT = "Hitchly-Probe/1.1 (+link checker)"
MAX_HOPS = 10
MAX_BODY = 65536
OVERALL_DEADLINE = 20.0


class BlockedTarget(ValueError):
    """The URL is not allowed to be fetched (message is safe to show to the user)."""


def ip_is_blocked(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    if isinstance(addr, ipaddress.IPv6Address):
        # IPv6 forms that smuggle an IPv4 address: check the embedded address too.
        embedded = addr.ipv4_mapped or addr.sixtofour
        if embedded is None and addr in ipaddress.ip_network("64:ff9b::/96"):  # NAT64
            embedded = ipaddress.IPv4Address(int(addr) & 0xFFFFFFFF)
        if embedded is not None and ip_is_blocked(str(embedded)):
            return True
    return (not addr.is_global or addr.is_multicast or addr.is_unspecified or addr.is_loopback
            or addr.is_link_local or addr.is_private or addr.is_reserved)


@dataclass(frozen=True)
class Target:
    scheme: str
    host: str
    port: int
    ip: str
    path: str  # path + query


class _PinnedHTTP(http.client.HTTPConnection):
    def __init__(self, host, port, ip, timeout):
        super().__init__(host, port, timeout=timeout)
        self._ip = ip

    def connect(self):
        self.sock = socket.create_connection((self._ip, self.port), self.timeout)


class _PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, port, ip, timeout):
        super().__init__(host, port, timeout=timeout, context=ssl.create_default_context())
        self._ip = ip

    def connect(self):
        sock = socket.create_connection((self._ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)  # verify the cert for the HOSTNAME


class _PageInfo(html.parser.HTMLParser):
    """Collects <title> text and og:/meta description. An og:title wins over <title> when both exist."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.og_title, self.title_text, self.description, self._in_title = "", "", "", False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            key = (a.get("property") or a.get("name") or "").lower()
            content = (a.get("content") or "").strip()
            if key == "og:title" and not self.og_title:
                self.og_title = content
            elif key in ("description", "og:description") and not self.description:
                self.description = content

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title and len(self.title_text) < 300:
            self.title_text += data

    @property
    def title(self) -> str:
        return self.og_title or self.title_text


def page_info(body: bytes, content_type: str) -> dict:
    if "html" not in content_type.lower():
        return {"title": "", "description": ""}
    parser = _PageInfo()
    try:
        parser.feed(body.decode("utf-8", "replace"))
        parser.close()  # flush text still buffered when the body was cut off at the size limit
    except Exception:  # malformed HTML must never break a probe
        pass
    clean = lambda s, n: " ".join(s.split())[:n]
    return {"title": clean(parser.title, 200), "description": clean(parser.description, 300)}


class Prober:
    def __init__(self, allow_private: bool = False, timeout: float = 6.0, resolver=None) -> None:
        self.allow_private = allow_private
        self.timeout = timeout
        self._resolver = resolver or self._system_resolver

    @staticmethod
    def _system_resolver(host: str, port: int) -> list[str]:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        return list(dict.fromkeys(i[4][0] for i in infos))

    # ---- validation ---------------------------------------------------
    def validate(self, url: str) -> Target:
        try:
            parts = urlsplit(url)
            port = parts.port
        except ValueError:
            raise BlockedTarget("That URL is malformed") from None
        if parts.scheme not in ("http", "https"):
            raise BlockedTarget("Only http and https URLs can be checked")
        if not parts.hostname:
            raise BlockedTarget("The URL has no host")
        if parts.username or parts.password:
            raise BlockedTarget("URLs with embedded credentials are not checked")
        port = port or (443 if parts.scheme == "https" else 80)
        if not self.allow_private and port not in ALLOWED_PORTS:
            raise BlockedTarget(f"Port {port} is not allowed (allowed: {', '.join(map(str, ALLOWED_PORTS))})")
        try:
            ips = self._resolver(parts.hostname, port)
        except (socket.gaierror, UnicodeError, OSError):
            raise BlockedTarget("Could not resolve that host name") from None
        if not ips:
            raise BlockedTarget("Could not resolve that host name")
        if not self.allow_private and any(ip_is_blocked(ip) for ip in ips):
            raise BlockedTarget("That address is private or internal and cannot be checked from this server")
        path = parts.path or "/"
        return Target(parts.scheme, parts.hostname, port, ips[0], path + ("?" + parts.query if parts.query else ""))

    # ---- one request --------------------------------------------------
    def _fetch(self, target: Target, method: str, read_body: bool) -> dict:
        cls = _PinnedHTTPS if target.scheme == "https" else _PinnedHTTP
        conn = cls(target.host, target.port, target.ip, self.timeout)
        started = time.monotonic()
        try:
            conn.request(method, target.path, headers={"User-Agent": USER_AGENT, "Accept": "*/*", "Connection": "close"})
            res = conn.getresponse()
            body = res.read(MAX_BODY) if read_body else b""
            return {"status": res.status, "headers": {k.lower(): v for k, v in res.getheaders()}, "body": body,
                    "ms": round((time.monotonic() - started) * 1000)}
        finally:
            conn.close()

    @staticmethod
    def _describe_error(exc: Exception) -> str:
        if isinstance(exc, ssl.SSLCertVerificationError):
            return "The site's TLS certificate is not valid"
        if isinstance(exc, ssl.SSLError):
            return "TLS handshake failed"
        if isinstance(exc, (socket.timeout, TimeoutError)):
            return "Timed out"
        if isinstance(exc, ConnectionRefusedError):
            return "Connection refused"
        if isinstance(exc, (http.client.HTTPException, OSError)):
            return "Could not connect"
        return "Request failed"

    # ---- public API ---------------------------------------------------
    def trace(self, url: str, want_page: bool = True, head_first: bool = False, max_hops: int = MAX_HOPS) -> dict:
        """Follow redirects manually (validating each hop) and describe the chain and the final page."""
        hops, seen, current = [], set(), url
        deadline = time.monotonic() + OVERALL_DEADLINE
        result = {"ok": False, "hops": hops, "final": None, "error": None}
        while True:
            if current in seen:
                result["error"] = "Redirect loop"
                return result
            seen.add(current)
            if len(hops) > max_hops:
                result["error"] = f"More than {max_hops} redirects"
                return result
            if time.monotonic() > deadline:
                result["error"] = "Took too long"
                return result
            try:
                target = self.validate(current)
            except BlockedTarget as e:
                result["error"] = str(e)
                return result
            try:
                res = self._fetch(target, "HEAD" if head_first else "GET", read_body=False)
                if head_first and res["status"] in (403, 405, 501):  # some servers reject HEAD
                    res = self._fetch(target, "GET", read_body=False)
            except Exception as e:  # noqa: BLE001 - every network failure becomes a short message
                hops.append({"url": current, "status": None, "ip": target.ip, "ms": None, "location": None})
                result["error"] = self._describe_error(e)
                return result
            location = res["headers"].get("location")
            hops.append({"url": current, "status": res["status"], "ip": target.ip, "ms": res["ms"], "location": location})
            if res["status"] in (301, 302, 303, 307, 308) and location:
                nxt = urljoin(current, location)
                if urlsplit(nxt).scheme not in ("http", "https"):
                    result["error"] = "Redirects to a non-web address"
                    return result
                current = nxt
                continue
            final = {"url": current, "status": res["status"], "content_type": res["headers"].get("content-type", ""),
                     "title": "", "description": ""}
            if want_page and res["status"] < 400 and "html" in final["content_type"].lower():
                try:
                    page = self._fetch(target, "GET", read_body=True)
                    final.update(page_info(page["body"], final["content_type"]))
                except Exception:  # noqa: BLE001 - title is a nicety; the status already succeeded
                    pass
            result["final"] = final
            result["ok"] = res["status"] < 400
            if not result["ok"]:
                result["error"] = f"HTTP {res['status']}"
            return result

    def check(self, url: str) -> dict:
        """Dead-link check: HEAD (GET fallback), follows redirects, no page parsing."""
        r = self.trace(url, want_page=False, head_first=True, max_hops=5)
        return {"ok": r["ok"], "status": r["final"]["status"] if r["final"] else None, "hops": len(r["hops"]),
                "final_url": r["final"]["url"] if r["final"] else None, "error": r["error"],
                "ms": sum(h["ms"] or 0 for h in r["hops"])}
