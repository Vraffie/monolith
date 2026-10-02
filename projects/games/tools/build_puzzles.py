#!/usr/bin/env python3
"""Generate bridge puzzles (site/data/bridges.json) from the word vectors.

A puzzle is a list of clue words. The generator looks for an intended answer that is a common word, picks clues that each relate to it
but not to each other (so a guess has to bridge different senses), and keeps the puzzle only if the scoring used in the game
(see site/lib/bridge.js, mirrored here) ranks the intended answer first with a clear margin. Deterministic for a given seed.
"""
import argparse, json, re
from pathlib import Path
import numpy as np
from wordfreq import zipf_frequency

FLOOR = 0.1
DATA = Path(__file__).resolve().parent.parent / "site" / "data"


def load():
    W = (DATA / "words.txt").read_text().split()
    Q = np.fromfile(DATA / "vectors.bin", dtype=np.int8).reshape(len(W), -1).astype(np.float32)
    Q /= np.linalg.norm(Q, axis=1, keepdims=True)
    return W, Q


def related(a, b):
    return a == b or a in b or b in a or (len(a) >= 4 and len(b) >= 4 and a[:4] == b[:4])


def combined(sims):
    mn = np.min(sims, axis=0)
    return mn if len(sims) == 1 else 0.75 * mn + 0.25 * np.mean(sims, axis=0)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--two", type=int, default=250); ap.add_argument("--three", type=int, default=150); ap.add_argument("--one", type=int, default=300)
    a = ap.parse_args()
    W, Q = load(); ix = {w: i for i, w in enumerate(W)}
    common = {w for w in (DATA / "common.txt").read_text().split() if w in ix}
    # Answers are concrete things (tools/concrete.txt): "river" makes a better puzzle than "concept".
    secrets = [w for w in (Path(__file__).parent / "concrete.txt").read_text().split() if w in ix]
    ok = np.array([w in common for w in W])
    zipf = np.array([zipf_frequency(w, "en") if w in common else 0.0 for w in W])
    rng = np.random.default_rng(a.seed)
    out = {"two": [], "three": [], "one": []}

    def best_two(answer, sims_list, clues):
        c = combined(sims_list)
        for i, w in enumerate(W):
            if any(related(w, x) for x in clues): c[i] = -9
        order = np.argsort(-c)[:3]
        return order, c

    for ans in rng.permutation(secrets):
        if all(len(out[k]) >= getattr(a, k) for k in out): break
        i = ix[ans]
        if not ok[i]: continue
        s = Q @ Q[i]
        cand = [j for j in np.argsort(-s)[1:60] if s[j] >= 0.42 and zipf[j] >= 4.0 and ok[j] and not related(W[j], ans)]
        if len(cand) < 4: continue
        for kind, n in (("two", 2), ("three", 3)):
            if len(out[kind]) >= getattr(a, kind): continue
            found = None
            for _ in range(40):
                pick = list(rng.choice(cand, n, replace=False))
                if any(related(W[x], W[y]) for x in pick for y in pick if x < y): continue
                if max(Q[x] @ Q[y] for x in pick for y in pick if x < y) > 0.28: continue   # clues must pull in different directions
                clues = [W[x] for x in pick]
                order, c = best_two(ans, [Q @ Q[x] for x in pick], clues)
                if order[0] == i and c[order[0]] - c[order[1]] >= 0.03 and c[i] >= 0.3:
                    found = clues; break
            if found: out[kind].append({"clues": found, "answer": ans})
    # "Closest connection" puzzles can use any common word, not only concrete ones.
    for ans in rng.permutation([w for w in (DATA / "secrets.txt").read_text().split() if w in common]):
        if len(out["one"]) >= a.one: break
        i = ix[ans]; s = Q @ Q[i]
        nb = [j for j in np.argsort(-s)[1:4] if not related(W[j], ans)]
        if nb and s[nb[0]] >= 0.55 and ok[nb[0]] and zipf[nb[0]] >= 3.5 and (len(nb) < 2 or s[nb[0]] - s[nb[1]] >= 0.04):
            out["one"].append({"clues": [str(ans)], "answer": W[nb[0]]})
    for k in out: print(k, len(out[k]))
    (DATA / "bridges.json").write_text(json.dumps(out, separators=(",", ":")))
    for k in out:
        for p in out[k][:6]: print(" ", k, p["clues"], "->", p["answer"])


if __name__ == "__main__":
    main()
