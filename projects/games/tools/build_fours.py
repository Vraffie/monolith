#!/usr/bin/env python3
"""Compile tools/fours.txt into site/data/fours.json and check every puzzle (4 groups x 4 unique words, no word twice)."""
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
puzzles, cur = [], []
for raw in (HERE / "fours.txt").read_text().splitlines() + [""]:
    line = raw.strip()
    if line.startswith("#"): continue
    if not line:
        if cur: puzzles.append(cur); cur = []
        continue
    title, _, words = line.partition("|")
    cur.append((title.strip(), words.split()))
bad = []
for n, p in enumerate(puzzles, 1):
    flat = [w.lower() for _, ws in p for w in ws]
    if len(p) != 4 or any(len(ws) != 4 for _, ws in p): bad.append(f"puzzle {n}: needs 4 groups of 4")
    if len(set(flat)) != len(flat): bad.append(f"puzzle {n}: duplicate word(s) {sorted({w for w in flat if flat.count(w) > 1})}")
if bad:
    sys.exit("\n".join(bad))
out = [{"groups": [{"title": t, "level": i, "words": ws} for i, (t, ws) in enumerate(p)]} for p in puzzles]
(HERE.parent / "site" / "data" / "fours.json").write_text(json.dumps(out, separators=(",", ":")))
print(f"{len(out)} puzzles")
