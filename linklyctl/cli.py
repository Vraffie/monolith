"""linklyctl — manage a Linkly server from the shell. Built on linkly_client."""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from linkly_client import Linkly, LinklyError

DURATION_RE = re.compile(r"^(\d+)([smhdw]?)$")
UNITS = {"": 1, "s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}


def parse_duration(text: str) -> int:
    """'90' / '30s' / '15m' / '2h' / '7d' / '1w' -> seconds."""
    m = DURATION_RE.match(text.strip().lower())
    if not m or int(m.group(1)) == 0:
        raise argparse.ArgumentTypeError(f"invalid duration '{text}' (examples: 3600, 90m, 2h, 7d, 1w)")
    return int(m.group(1)) * UNITS[m.group(2)]


def _ts(value: int | None) -> str:
    return "never" if value is None else datetime.fromtimestamp(value, timezone.utc).strftime("%Y-%m-%d %H:%M")


def _print_table(rows: list[list[str]], header: list[str], out) -> None:
    table = [header] + rows
    widths = [max(len(str(r[i])) for r in table) for i in range(len(header))]
    for r in table:
        print("  ".join(str(c).ljust(w) for c, w in zip(r, widths)).rstrip(), file=out)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="linklyctl", description="Manage a Linkly URL shortener.")
    p.add_argument("--url", default=os.environ.get("LINKLY_URL", "http://127.0.0.1:8080"),
                   help="server URL (env LINKLY_URL, default %(default)s)")
    p.add_argument("--token", default=os.environ.get("LINKLY_TOKEN", ""), help="API token (env LINKLY_TOKEN)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("new", help="shorten a URL; prints the short URL")
    s.add_argument("target")
    s.add_argument("--slug")
    s.add_argument("--ttl", type=parse_duration, metavar="DURATION", help="expire after e.g. 2h, 7d")

    s = sub.add_parser("ls", help="list links")
    s.add_argument("--limit", type=int, default=50)
    s.add_argument("--json", action="store_true")

    s = sub.add_parser("get", help="show one link"); s.add_argument("slug")

    s = sub.add_parser("edit", help="change a link's target or expiry")
    s.add_argument("slug")
    s.add_argument("--target", help="new destination URL")
    g = s.add_mutually_exclusive_group()
    g.add_argument("--ttl", type=parse_duration, metavar="DURATION", help="restart expiry countdown")
    g.add_argument("--no-expiry", action="store_true", help="remove expiry")

    s = sub.add_parser("rm", help="delete a link")
    s.add_argument("slug"); s.add_argument("-y", "--yes", action="store_true", help="don't ask")

    s = sub.add_parser("stats", help="click analytics")
    s.add_argument("slug"); s.add_argument("--days", type=int, default=7)

    s = sub.add_parser("clicks", help="dump a link's raw clicks as CSV"); s.add_argument("slug")

    s = sub.add_parser("export", help="export all links")
    s.add_argument("--format", choices=["json", "csv"], default="json")

    s = sub.add_parser("import", help="bulk-create links from a .json or .csv file (url[,slug,ttl_seconds])")
    s.add_argument("file")
    s.add_argument("--skip-existing", action="store_true", help="treat slug conflicts as skipped, not failed")

    s = sub.add_parser("check", help="probe every target URL; exit 1 if any is dead")
    s.add_argument("--timeout", type=float, default=8.0)
    s.add_argument("--workers", type=int, default=8)
    return p


def _read_import_rows(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        if path.lower().endswith(".json"):
            rows = json.load(f)
            if not isinstance(rows, list):
                raise ValueError("JSON import must be a list of objects")
        else:
            rows = list(csv.DictReader(f))
    return rows


def probe(url: str, timeout: float) -> tuple[bool, str]:
    """HEAD (falling back to GET) without following redirects; 2xx/3xx is alive."""
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    last = "error"
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(url, method=method, headers={"User-Agent": "linklyctl-check/1.1"})
        try:
            with opener.open(req, timeout=timeout) as res:
                return True, str(res.status)
        except urllib.error.HTTPError as e:
            if e.code < 400:
                return True, str(e.code)
            last = str(e.code)
            if method == "HEAD" and e.code in (403, 405, 501):
                continue  # some servers reject HEAD
            return False, last
        except Exception as e:  # DNS failure, refused, timeout, TLS...
            return False, getattr(e, "reason", None) and str(e.reason) or type(e).__name__
    return False, last


def run(args, api: Linkly, out, err, confirm=input) -> int:
    cmd = args.cmd
    if cmd == "new":
        print(api.create(args.target, args.slug, args.ttl)["short_url"], file=out)
    elif cmd == "ls":
        links = api.list(args.limit)["links"]
        if args.json:
            print(json.dumps(links, indent=2), file=out)
        else:
            _print_table([[l["slug"], l["clicks"], _ts(l["expires_at"]) + (" (expired)" if l["expired"] else ""), l["url"]]
                          for l in links], ["SLUG", "CLICKS", "EXPIRES", "TARGET"], out)
    elif cmd == "get":
        print(json.dumps(api.get(args.slug), indent=2), file=out)
    elif cmd == "edit":
        kwargs = {"url": args.target}
        if args.no_expiry:
            kwargs["ttl_seconds"] = None
        elif args.ttl:
            kwargs["ttl_seconds"] = args.ttl
        if kwargs["url"] is None and "ttl_seconds" not in kwargs:
            print("nothing to change: pass --target, --ttl or --no-expiry", file=err)
            return 2
        link = api.update(args.slug, **kwargs)
        print(f"{link['short_url']} -> {link['url']} (expires: {_ts(link['expires_at'])})", file=out)
    elif cmd == "rm":
        if not args.yes and confirm(f"Delete '{args.slug}' and its click history? [y/N] ").strip().lower() != "y":
            print("aborted", file=err)
            return 1
        api.delete(args.slug)
        print(f"deleted {args.slug}", file=out)
    elif cmd == "stats":
        s = api.stats(args.slug, args.days)
        print(f"{s['slug']}: {s['total_clicks']} total clicks", file=out)
        for d in s["clicks_per_day"]:
            print(f"  {d['day']}  {'#' * min(d['clicks'], 40)} {d['clicks']}", file=out)
        for r in s["top_referrers"]:
            print(f"  referrer {r['referrer']} ({r['clicks']})", file=out)
    elif cmd == "clicks":
        out.write(api.clicks_csv(args.slug))
    elif cmd == "export":
        links = list(api.iter_links())
        if args.format == "json":
            print(json.dumps(links, indent=2), file=out)
        else:
            w = csv.writer(out)
            w.writerow(["slug", "url", "created_at", "expires_at", "clicks"])
            for l in links:
                w.writerow([l["slug"], l["url"], l["created_at"], l["expires_at"] or "", l["clicks"]])
    elif cmd == "import":
        created = skipped = failed = 0
        for n, row in enumerate(_read_import_rows(args.file), start=1):
            ttl = row.get("ttl_seconds")
            try:
                api.create(row.get("url") or "", (row.get("slug") or None), int(ttl) if ttl not in (None, "") else None)
                created += 1
            except (LinklyError, ValueError) as e:
                if args.skip_existing and isinstance(e, LinklyError) and e.status == 409:
                    skipped += 1
                else:
                    failed += 1
                    print(f"row {n}: {e}", file=err)
        print(f"imported: {created} created, {skipped} skipped, {failed} failed", file=out)
        return 1 if failed else 0
    elif cmd == "check":
        links = list(api.iter_links())
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            results = list(pool.map(lambda l: probe(l["url"], args.timeout), links))
        dead = [(l, why) for l, (ok, why) in zip(links, results) if not ok]
        for l, why in dead:
            print(f"DEAD  {l['slug']}  {l['url']}  ({why})", file=out)
        print(f"checked {len(links)} link(s): {len(links) - len(dead)} ok, {len(dead)} dead", file=out)
        return 1 if dead else 0
    return 0


def main(argv: list[str] | None = None, out=None, err=None) -> int:
    out, err = out or sys.stdout, err or sys.stderr
    args = build_parser().parse_args(argv)
    if not args.token:
        print("error: no API token (use --token or LINKLY_TOKEN)", file=err)
        return 2
    try:
        return run(args, Linkly(args.url, args.token), out, err)
    except LinklyError as e:
        print(f"error: {e}", file=err)
        return 1
    except (OSError, ValueError) as e:
        print(f"error: {e}", file=err)
        return 1


def main_cli() -> None:  # console-script entry point
    sys.exit(main())
