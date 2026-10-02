// Logic for the "fours" game: 16 words, four hidden groups of four. A puzzle is
// { groups: [{ title, level: 0..3, words: [4 words] }, ...] } with level 0 the easiest group.

export function validate(p) {
  const errs = [], seen = new Set();
  if (!p || !Array.isArray(p.groups) || p.groups.length !== 4) return ["a puzzle needs exactly 4 groups"];
  const levels = new Set();
  for (const g of p.groups) {
    if (!g.title) errs.push("group without a title");
    if (!Array.isArray(g.words) || g.words.length !== 4) errs.push(`"${g.title}": needs exactly 4 words`);
    levels.add(g.level);
    for (const w of g.words || []) { const k = w.toLowerCase(); if (seen.has(k)) errs.push(`duplicate word "${w}"`); seen.add(k); if (!w.trim() || w !== w.trim()) errs.push(`bad word "${w}"`); }
  }
  if (levels.size !== 4 || [0, 1, 2, 3].some(l => !levels.has(l))) errs.push("levels must be 0, 1, 2 and 3, one each");
  return errs;
}

/** Judge a guess of four words. Returns { correct, group } or { correct:false, oneAway } (3 of 4 in one group). */
export function judge(p, guess) {
  if (new Set(guess).size !== 4) return { error: "Pick four different words." };
  let bestHits = 0;
  for (const g of p.groups) {
    const hits = guess.filter(w => g.words.includes(w)).length;
    if (hits === 4) return { correct: true, group: g };
    bestHits = Math.max(bestHits, hits);
  }
  return { correct: false, oneAway: bestHits === 3 };
}

export const MAX_MISTAKES = 4;
export const COLOURS = ["#f9df6d", "#a0c35a", "#b0c4ef", "#ba81c5"];   // yellow, green, blue, purple by level
