"""Command line: ``python -m xmlgraph PATH [--format html|mermaid|dot|json]``."""
from __future__ import annotations

import argparse
import sys

from . import render
from .core import scan


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="xmlgraph", description="Visualise key references between XML files.")
    p.add_argument("path", help="directory (scanned recursively) or a single XML file")
    p.add_argument("-f", "--format", choices=["html", "mermaid", "dot", "json"], default="html")
    p.add_argument("-o", "--output", help="output file (default: stdout; html needs a file or redirect)")
    p.add_argument("--files", action="store_true", help="mermaid/dot: one node per file instead of per entity")
    p.add_argument("--key-tag", default="key", help="element that names an entity (default: key)")
    p.add_argument("--ref-suffix", default="Key", help="tag suffix marking a reference (default: Key)")
    a = p.parse_args(argv)

    g = scan(a.path, a.key_tag, a.ref_suffix)
    text = {
        "html": lambda: render.to_html(g),
        "mermaid": lambda: render.to_mermaid(g, a.files),
        "dot": lambda: render.to_dot(g, a.files),
        "json": lambda: render.to_json(g),
    }[a.format]()
    if a.output:
        with open(a.output, "w", encoding="utf-8") as fh:
            fh.write(text)
    else:
        sys.stdout.write(text)
    ext = sum(n.external for n in g.nodes.values())
    print(f"{len(g.files)} files, {len(g.nodes) - ext} entities, {len(g.edges)} references, "
          f"{ext} unresolved targets, {len(g.errors)} parse errors", file=sys.stderr)
    for f, err in g.errors.items():
        print(f"  parse error in {f}: {err}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
