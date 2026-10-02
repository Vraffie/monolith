#!/usr/bin/env python3
"""Build the word-vector data the games ship with.

Inputs (downloaded once, not committed):
  --numberbatch  numberbatch-en-19.08.txt.gz  (ConceptNet Numberbatch, CC BY-SA 4.0; 300-d, English)
  --common       google-10000-english-no-swears.txt (a list of common words used to pick secret words)
Outputs (committed, in site/data/):
  words.txt     guessable vocabulary, one per line, most frequent first
  vectors.bin   int8, len(words) x DIM, unit vectors scaled by 127 (PCA-reduced)
  secrets.txt   words a puzzle may be built around (common, concrete-ish, family friendly)
  common.txt    non-proper words common enough to be clues/answers (names, cities and countries removed unless very frequent)
Needs numpy, wordfreq, english-words, gender-guesser and geonamescache (pip install numpy wordfreq english-words gender-guesser geonamescache).
"""
import argparse, gzip, re, sys
from pathlib import Path
import numpy as np
import geonamescache
import gender_guesser.detector as gender
from english_words import get_english_words_set
from wordfreq import top_n_list, zipf_frequency

VOCAB, DIM = 30000, 160
# Not exhaustive: a guard for a family game, not a content filter. Words here are dropped from guesses and answers.
BLOCK = set("""ass asses arse bastard bitch bitches bollocks cock cocks coon crap cum cunt cunts damn dick dicks dildo dyke fag fags
faggot fuck fucked fucker fucking fucks hell homo jerk kike nazi negro nigga nigger orgasm penis piss porn porno prick pussy rape
raped rapist retard shit shits slut sluts spic tit tits twat vagina whore whores sex sexy sexual nude naked anal anus semen sperm
erotic fetish molest incest genital genitals masturbate masturbation hooker prostitute""".split())
INFLECT = [("ies", "y"), ("es", ""), ("s", ""), ("ed", ""), ("d", ""), ("ing", ""), ("ing", "e"), ("ly", ""), ("er", ""), ("est", "")]


def read_numberbatch(path, wanted):
    vecs = {}
    with gzip.open(path, "rt", encoding="utf8") as f:
        next(f)
        for line in f:
            key, _, rest = line.partition(" ")
            w = key[6:] if key.startswith("/c/en/") else key
            if w in wanted:
                vecs[w] = np.array(rest.split(), dtype=np.float32)
    return vecs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--numberbatch", required=True); ap.add_argument("--common", required=True)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "site" / "data"))
    a = ap.parse_args()
    common = [w.strip() for w in open(a.common) if w.strip()]
    # Numberbatch lowercases everything, so names look like words ("stafford", "messi"). Keep a word only if a dictionary lists it
    # in lower case (web2 spells proper nouns with capitals) or it is among the common words (modern ones: email, website).
    dictionary = get_english_words_set(["web2"], lower=False, alpha=True) | set(common)
    cand = [w for w in top_n_list("en", 250000) if re.fullmatch(r"[a-z]{3,12}", w) and w not in BLOCK and zipf_frequency(w, "en") >= 3.0 and w in dictionary]
    vecs = read_numberbatch(a.numberbatch, set(cand))
    words = [w for w in cand if w in vecs][:VOCAB * 2]
    have = set(words)
    # Drop simple inflections of words that are present: guessing "dogs" next to "dog" adds noise, not play.
    def inflected(w):
        for suf, rep in INFLECT:
            if w.endswith(suf) and len(w) > len(suf) + 2:
                base = w[: -len(suf)] + rep
                if base in have and base != w:
                    return True
        return False
    words = [w for w in words if not inflected(w)][:VOCAB]
    X = np.stack([vecs[w] for w in words])
    X /= np.linalg.norm(X, axis=1, keepdims=True)
    mu = X.mean(0)
    U, S, Vt = np.linalg.svd(X - mu, full_matrices=False)
    Y = (X - mu) @ Vt[:DIM].T
    Y /= np.linalg.norm(Y, axis=1, keepdims=True)
    # fidelity of the reduced + quantised vectors: how much of each word's true top-50 neighbourhood survives
    Q = np.round(Y * 127).astype(np.int8); Z = Q.astype(np.float32); Z /= np.linalg.norm(Z, axis=1, keepdims=True)
    rng = np.random.default_rng(1); ov = []
    for i in rng.choice(len(words), 300, replace=False):
        t = set(np.argsort(-(X @ X[i]))[1:51]); r = set(np.argsort(-(Z @ Z[i]))[1:51]); ov.append(len(t & r) / 50)
    print(f"{len(words)} words, {DIM} dims, top-50 neighbour overlap with the 300-d originals: {np.mean(ov):.2f}", file=sys.stderr)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / "words.txt").write_text("\n".join(words) + "\n")
    (out / "vectors.bin").write_bytes(Q.tobytes())
    idx = {w: i for i, w in enumerate(words)}
    gc, det = geonamescache.GeonamesCache(), gender.Detector(case_sensitive=False)
    places = {c["name"].lower() for c in gc.get_cities().values()} | {c["name"].lower() for c in gc.get_countries().values()} | {x["name"].lower() for x in gc.get_us_states().values()}
    def proper(w):   # a name or a place, unless the word is so frequent that people mostly mean the ordinary one (river, rose, orange)
        return zipf_frequency(w, "en") < 4.6 and (w in places or det.get_gender(w.capitalize()) != "unknown")
    plain = [w for w in words if not proper(w)]
    (out / "common.txt").write_text("\n".join(w for w in plain if zipf_frequency(w, "en") >= 3.8) + "\n")
    secrets = [w for w in common[200:6500] if w in idx and len(w) >= 4 and idx[w] < 12000 and not proper(w)]
    (out / "secrets.txt").write_text("\n".join(secrets) + "\n")
    print(f"{len(secrets)} secret words; vectors.bin {Q.nbytes/1e6:.2f} MB", file=sys.stderr)


if __name__ == "__main__":
    main()
