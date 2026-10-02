// Progress and stats live in this browser only (localStorage). Every access is guarded: private windows and blocked storage must not break a game.
export function load(key, fallback) {
  try { const s = localStorage.getItem("wordplay:" + key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem("wordplay:" + key, JSON.stringify(value)); return true; } catch { return false; }
}
/** Record a finished game and keep a streak of consecutive days. */
export function recordResult(game, day, score) {
  const s = load("stats:" + game, { played: 0, streak: 0, best: 0, last: 0, history: {} });
  if (s.history[day] !== undefined) return s;
  s.history[day] = score; s.played++;
  s.streak = s.last === day - 1 ? s.streak + 1 : 1; s.last = day; s.best = Math.max(s.best, s.streak);
  save("stats:" + game, s);
  return s;
}
