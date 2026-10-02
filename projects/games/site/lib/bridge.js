// Scoring for the "bridge" game: how well does one word sit between the clue words?
// A word must fit EVERY clue, so the combined closeness leans on the weakest link (0.75 * min + 0.25 * mean).
// Scores are relative to the best word we know, so the strongest link scores exactly 1000 and unrelated words score ~0.
const FLOOR = 0.1, CURVE = 1.6;

export class Bridge {
  /** `clues` are words (must be in the space). One clue = "closest connection"; two or three = a bridge. */
  constructor(space, clues) {
    this.space = space; this.clues = clues; this.ids = clues.map(w => space.id(w));
    if (this.ids.some(i => i < 0)) throw new Error("clue not in the word list: " + clues.join(", "));
    this.sims = this.ids.map(i => space.simAll(i));
    this.combined = new Float32Array(space.n);
    let best = -1, bestSum = -Infinity;
    for (let i = 0; i < space.n; i++) {
      let mn = 2, sum = 0;
      for (const s of this.sims) { if (s[i] < mn) mn = s[i]; sum += s[i]; }
      const c = clues.length === 1 ? mn : 0.75 * mn + 0.25 * (sum / clues.length);
      this.combined[i] = c;
      if (this.allowed(space.words[i]) && c > bestSum) { bestSum = c; best = i; }
    }
    this.best = best; this.bestValue = bestSum;
  }

  /** Clue words and their obvious variants ("pizzas" for "pizza") are not valid answers. */
  allowed(word) { return !this.clues.some(c => word === c || word.includes(c) || c.includes(word)); }

  /** 0-1000 for a guessed word id, plus the similarity to each clue (0-1000 each) for drawing the chains. */
  score(id) {
    if (!this.allowed(this.space.words[id])) return { error: "That word is part of the clue." };
    const f = c => Math.max(0, Math.min(1, (c - FLOOR) / (this.bestValue - FLOOR))) ** CURVE;
    return { score: Math.round(1000 * f(this.combined[id])), links: this.sims.map(s => Math.round(1000 * f(s[id]))) };
  }

  /** The `k` strongest answers, for the end-of-round reveal. */
  top(k = 5) {
    const ids = [];
    for (let i = 0; i < this.space.n; i++) if (this.allowed(this.space.words[i])) ids.push(i);
    ids.sort((a, b) => this.combined[b] - this.combined[a]);
    return ids.slice(0, k).map(i => this.space.words[i]);
  }
}
