"""hitch — manage a Hitchly server from the shell. Built on hitchly_client."""

from __future__ import annotations

import argparse
import csv
import getpass
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from hitchly_client import Hitchly, HitchlyError

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


def _password_args(s) -> None:
    # Deliberately no --password VALUE: it would leak into shell history and `ps`.
    g = s.add_mutually_exclusive_group()
    g.add_argument("--ask-password", action="store_true", help="prompt for a link password (hidden input)")
    g.add_argument("--password-env", metavar="VAR", help="read the link password from environment variable VAR")


def _read_link_password(args, ask=getpass.getpass) -> str | None:
    if getattr(args, "ask_password", False):
        first = ask("Link password: ")
        if first != ask("Repeat password: "):
            raise ValueError("passwords do not match")
        return first
    if getattr(args, "password_env", None):
        value = os.environ.get(args.password_env)
        if not value:
            raise ValueError(f"environment variable {args.password_env} is empty or unset")
        return value
    return None


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="hitch", description="Manage a Hitchly URL shortener.")
    p.add_argument("--url", default=os.environ.get("HITCHLY_URL", "http://127.0.0.1:8080"),
                   help="server URL (env HITCHLY_URL, default %(default)s)")
    p.add_argument("--token", default=os.environ.get("HITCHLY_TOKEN", ""), help="API token (env HITCHLY_TOKEN)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("new", help="shorten a URL; prints the short URL")
    s.add_argument("target")
    s.add_argument("--slug")
    s.add_argument("--ttl", type=parse_duration, metavar="DURATION", help="expire after e.g. 2h, 7d")
    s.add_argument("--tag", action="append", default=[], help="tag the link (repeatable)")
    s.add_argument("--max-visits", type=int, metavar="N", help="stop redirecting (410) after N human visits")
    _password_args(s)

    s = sub.add_parser("ls", help="list links")
    s.add_argument("--limit", type=int, default=50)
    s.add_argument("--tag", help="only links with this tag")
    s.add_argument("--search", metavar="TEXT", help="only links whose slug or target contains TEXT")
    s.add_argument("--json", action="store_true")

    s = sub.add_parser("get", help="show one link"); s.add_argument("slug")

    s = sub.add_parser("edit", help="change a link's target or expiry")
    s.add_argument("slug")
    s.add_argument("--target", help="new destination URL")
    g = s.add_mutually_exclusive_group()
    g.add_argument("--ttl", type=parse_duration, metavar="DURATION", help="restart expiry countdown")
    g.add_argument("--no-expiry", action="store_true", help="remove expiry")
    s.add_argument("--tag", action="append", default=None, help="replace the tag list (repeatable)")
    s.add_argument("--clear-tags", action="store_true", help="remove all tags")
    _password_args(s)
    s.add_argument("--no-password", action="store_true", help="remove password protection")
    g2 = s.add_mutually_exclusive_group()
    g2.add_argument("--max-visits", type=int, metavar="N", help="set the visit cap")
    g2.add_argument("--no-max-visits", action="store_true", help="remove the visit cap")

    s = sub.add_parser("rm", help="delete a link")
    s.add_argument("slug"); s.add_argument("-y", "--yes", action="store_true", help="don't ask")

    s = sub.add_parser("stats", help="click analytics")
    s.add_argument("slug"); s.add_argument("--days", type=int, default=7)
    s.add_argument("--include-bots", action="store_true", help="count crawlers/previews in the per-day bars")

    s = sub.add_parser("clicks", help="dump a link's raw clicks as CSV"); s.add_argument("slug")

    s = sub.add_parser("qr", help="write a link's QR code as SVG (stdout, or -o FILE)")
    s.add_argument("slug"); s.add_argument("-o", "--output")

    s = sub.add_parser("export", help="export all links")
    s.add_argument("--format", choices=["json", "csv"], default="json")

    s = sub.add_parser("import", help="bulk-create links from a .json or .csv file (url[,slug,ttl_seconds,tags,max_visits])")
    s.add_argument("file")
    s.add_argument("--skip-existing", action="store_true", help="treat slug conflicts as skipped, not failed")
    s.add_argument("--dry-run", action="store_true", help="parse and map the file, report problems, send nothing")
    s.add_argument("--delimiter", default=",", help="CSV delimiter (default ',')")
    s.add_argument("--default-tag", action="append", default=[], metavar="TAG",
                   help="add this tag to every imported link (repeatable), e.g. 'imported'")
    m = s.add_argument_group("column mapping (names of columns/keys in your file; defaults shown)")
    for field, default in IMPORT_FIELDS.items():
        m.add_argument(f"--{field.replace('_', '-')}-col", metavar="NAME", default=default,
                       help=f"column for {field} (default '{default}')")
    m.add_argument("--slug-last-segment", action="store_true",
                   help="if the slug column holds a short URL like https://bit.ly/abc, keep only 'abc'")

    s = sub.add_parser("check", help="probe every target URL; exit 1 if any is dead")
    s.add_argument("--timeout", type=float, default=8.0)
    s.add_argument("--workers", type=int, default=8)
    return p


IMPORT_FIELDS = {"url": "url", "slug": "slug", "ttl_seconds": "ttl_seconds", "tags": "tags", "max_visits": "max_visits"}


def _read_import_rows(path: str, delimiter: str = ",") -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as f:  # utf-8-sig: tolerate the BOM Excel adds
        if path.lower().endswith(".json"):
            rows = json.load(f)
            if not isinstance(rows, list):
                raise ValueError("JSON import must be a list of objects")
        else:
            rows = list(csv.DictReader(f, delimiter=delimiter))
    return rows


def probe(url: str, timeout: float) -> tuple[bool, str]:
    """HEAD (falling back to GET) without following redirects; 2xx/3xx is alive."""
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    last = "error"
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(url, method=method, headers={"User-Agent": "hitch-check/1.1"})
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


def run(args, api: Hitchly, out, err, confirm=input) -> int:
    cmd = args.cmd
    if cmd == "new":
        print(api.create(args.target, args.slug, args.ttl, args.tag, args.max_visits,
                         _read_link_password(args))["short_url"], file=out)
    elif cmd == "ls":
        links = api.list(args.limit, tag=args.tag, q=args.search)["links"]
        if args.json:
            print(json.dumps(links, indent=2), file=out)
        else:
            _print_table([[l["slug"] + (" 🔒" if l["protected"] else ""), l["clicks"],
                           _ts(l["expires_at"]) + (" (expired)" if l["expired"] else ""),
                           ",".join(l["tags"]), l["url"]] for l in links],
                         ["SLUG", "CLICKS", "EXPIRES", "TAGS", "TARGET"], out)
    elif cmd == "get":
        print(json.dumps(api.get(args.slug), indent=2), file=out)
    elif cmd == "edit":
        kwargs = {"url": args.target}
        if args.no_expiry:
            kwargs["ttl_seconds"] = None
        elif args.ttl:
            kwargs["ttl_seconds"] = args.ttl
        if args.clear_tags:
            kwargs["tags"] = []
        elif args.tag is not None:
            kwargs["tags"] = args.tag
        if args.no_password:
            kwargs["password"] = None
        elif (pw := _read_link_password(args)) is not None:
            kwargs["password"] = pw
        if args.no_max_visits:
            kwargs["max_visits"] = None
        elif args.max_visits is not None:
            kwargs["max_visits"] = args.max_visits
        if kwargs["url"] is None and not {"ttl_seconds", "tags", "max_visits", "password"} & kwargs.keys():
            print("nothing to change: pass --target, --ttl, --no-expiry, --tag, --clear-tags, "
                  "--max-visits, --no-max-visits, --ask-password, --password-env or --no-password", file=err)
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
        s = api.stats(args.slug, args.days, args.include_bots)
        print(f"{s['slug']}: {s['total_clicks']} visits (+{s['bot_clicks']} bot)", file=out)
        for d in s["clicks_per_day"]:
            print(f"  {d['day']}  {'#' * min(d['clicks'], 40)} {d['clicks']}", file=out)
        for r in s["top_referrers"]:
            print(f"  referrer {r['referrer']} ({r['clicks']})", file=out)
    elif cmd == "clicks":
        out.write(api.clicks_csv(args.slug))
    elif cmd == "qr":
        svg = api.qr_svg(args.slug)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(svg)
            print(f"wrote {args.output}", file=out)
        else:
            out.write(svg)
    elif cmd == "export":
        links = list(api.iter_links())
        if args.format == "json":
            print(json.dumps(links, indent=2), file=out)
        else:
            w = csv.writer(out)
            w.writerow(["slug", "url", "created_at", "expires_at", "clicks", "tags"])
            for l in links:
                w.writerow([l["slug"], l["url"], l["created_at"], l["expires_at"] or "", l["clicks"], ";".join(l["tags"])])
    elif cmd == "import":
        cols = {field: getattr(args, f"{field}_col") for field in IMPORT_FIELDS}
        rows = _read_import_rows(args.file, args.delimiter)
        if rows and cols["url"] not in rows[0]:
            print(f"error: no '{cols['url']}' column; found: {', '.join(map(str, rows[0]))}. "
                  f"Use --url-col to name it.", file=err)
            return 2
        created = skipped = failed = 0
        for n, row in enumerate(rows, start=1):
            url = (row.get(cols["url"]) or "").strip() if isinstance(row.get(cols["url"]), (str, type(None))) else ""
            slug = row.get(cols["slug"]) or None
            if slug and args.slug_last_segment:
                slug = str(slug).rstrip("/").rsplit("/", 1)[-1] or None
            ttl = row.get(cols["ttl_seconds"])
            cap = row.get(cols["max_visits"])
            raw_tags = row.get(cols["tags"]) or []
            if isinstance(raw_tags, str):
                raw_tags = [t for t in re.split(r"[;,]", raw_tags) if t.strip()]
            tags = [*raw_tags, *args.default_tag]
            if args.dry_run:
                if url:
                    created += 1
                else:
                    failed += 1
                    print(f"row {n}: missing '{cols['url']}'", file=err)
                continue
            try:
                api.create(url, slug, int(ttl) if ttl not in (None, "") else None, tags,
                           int(cap) if cap not in (None, "") else None)
                created += 1
            except (HitchlyError, ValueError) as e:
                if args.skip_existing and isinstance(e, HitchlyError) and e.status == 409:
                    skipped += 1
                else:
                    failed += 1
                    print(f"row {n}: {e}", file=err)
        if args.dry_run:
            print(f"dry run: {created} would be sent, {failed} rows have no URL", file=out)
        else:
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
        print("error: no API token (use --token or HITCHLY_TOKEN)", file=err)
        return 2
    try:
        return run(args, Hitchly(args.url, args.token), out, err)
    except HitchlyError as e:
        print(f"error: {e}", file=err)
        return 1
    except (OSError, ValueError) as e:
        print(f"error: {e}", file=err)
        return 1


def main_cli() -> None:  # console-script entry point
    sys.exit(main())
