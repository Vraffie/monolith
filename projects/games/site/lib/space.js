// The word space: ~14k English words with 160-d vectors (ConceptNet Numberbatch, PCA-reduced, int8; see tools/build_data.py).
// Everything the games do is arithmetic on these vectors, so it all runs in the browser with no server.
export class Space {
  constructor(words, bytes, dim) {
    if (bytes.length !== words.length * dim) throw new Error(`vectors.bin has ${bytes.length} bytes, expected ${words.length * dim}`);
    this.words = words; this.dim = dim; this.n = words.length;
    this.v = new Float32Array(bytes.length);
    for (let i = 0; i < this.n; i++) {
      let s = 0;
      for (let k = 0; k < dim; k++) { const x = ((bytes[i * dim + k] << 24) >> 24); this.v[i * dim + k] = x; s += x * x; }   // int8 -> signed
      const inv = 1 / Math.sqrt(s || 1);
      for (let k = 0; k < dim; k++) this.v[i * dim + k] *= inv;
    }
    this.index = new Map(words.map((w, i) => [w, i]));
  }

  static parse(wordsText, bytes, dim = 160) { return new Space(wordsText.split("\n").filter(Boolean), bytes, dim); }
  id(word) { const i = this.index.get(word); return i === undefined ? -1 : i; }

  /** Cosine similarity of two words by id (vectors are unit length). */
  sim(a, b) {
    const d = this.dim, v = this.v;
    let s = 0;
    for (let k = 0; k < d; k++) s += v[a * d + k] * v[b * d + k];
    return s;
  }

  /** Similarity of every word to word `a`. */
  simAll(a) {
    const out = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) out[i] = this.sim(a, i);
    return out;
  }

  /** Ranking around a secret word: rankOf[i] is 1 for the secret itself, 2 for its nearest word, … */
  ranking(secret) {
    const s = this.simAll(secret), order = Array.from({ length: this.n }, (_, i) => i);
    order.sort((x, y) => s[y] - s[x] || x - y);
    const rankOf = new Int32Array(this.n);
    order.forEach((id, r) => { rankOf[id] = r + 1; });
    return { order, rankOf, sims: s };
  }
}

// Reduce a typed word to the form in the vocabulary: "Dogs " -> "dog". Mirrors the inflection rule in tools/build_data.py.
const SUFFIXES = [["ies", "y"], ["es", ""], ["s", ""], ["ed", ""], ["d", ""], ["ing", ""], ["ing", "e"], ["ly", ""], ["er", ""], ["est", ""]];
export function normalise(space, text) {
  const w = String(text).trim().toLowerCase();
  if (!/^[a-z]{2,24}$/.test(w)) return { error: "Type a single English word (letters only)." };
  if (space.index.has(w)) return { word: w };
  for (const [suf, rep] of SUFFIXES) {
    if (w.endsWith(suf) && w.length > suf.length + 2) { const base = w.slice(0, -suf.length) + rep; if (space.index.has(base)) return { word: base, from: w }; }
  }
  return { error: `"${w}" is not in the word list.` };
}
