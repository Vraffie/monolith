// Everyone gets the same puzzle on the same (UTC) day; the sequence never repeats until the list is used up.
export const EPOCH = Date.UTC(2026, 9, 1);   // day 1 = 2026-10-01
export const dayNumber = (now = new Date()) => Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - EPOCH) / 864e5) + 1;

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** A fixed pseudo-random order of 0..n-1 for a given salt (so each game has its own sequence). */
export function permutation(n, salt) {
  const r = mulberry32(salt), a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Puzzle index for a day number (1-based) out of `n` puzzles. */
export const pick = (n, day, salt) => permutation(n, salt)[(((day - 1) % n) + n) % n];

export function shuffled(items, seed) {
  const r = mulberry32(seed), a = items.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
