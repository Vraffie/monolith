const ROMAN = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

export function toRoman(n) {
  if (!Number.isInteger(n) || n < 1 || n > 3999) throw new Error("Roman numerals cover 1 to 3999");
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

/** Strict: only the canonical form is accepted, so IIII, VX and IC are errors rather than guesses. */
export function fromRoman(text) {
  const s = text.trim().toUpperCase();
  if (!/^[MDCLXVI]+$/.test(s)) throw new Error("Use the letters M D C L X V I");
  let n = 0, i = 0;
  for (const [v, sym] of ROMAN) while (s.startsWith(sym, i)) { n += v; i += sym.length; }
  if (i !== s.length || toRoman(n) !== s) throw new Error(`'${text.trim()}' is not a canonical Roman numeral`);
  return n;
}

export const percentOf = (pct, x) => (pct / 100) * x;
export function whatPercent(x, y) { if (y === 0) throw new Error("Cannot divide by zero"); return (x / y) * 100; }
export function percentChange(from, to) { if (from === 0) throw new Error("A change from zero has no percentage"); return ((to - from) / Math.abs(from)) * 100; }

export function temperature(value, from, to) {
  const toK = { C: v => v + 273.15, F: v => ((v - 32) * 5) / 9 + 273.15, K: v => v }, fromK = { C: k => k - 273.15, F: k => ((k - 273.15) * 9) / 5 + 32, K: k => k };
  if (!toK[from] || !toK[to]) throw new Error("Units are C, F or K");
  const k = toK[from](value);
  if (k < -1e-9) throw new Error("That is below absolute zero");
  return fromK[to](k);
}

// Every factor is the exact number of base units (metre, kilogram, byte, second) in one unit.
export const TABLES = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, um: 1e-6, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344, nmi: 1852 },
  mass: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318 },
  data: { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4, PiB: 1024 ** 5, bit: 0.125 },
  time: { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400, wk: 604800 },
};

export function convertUnit(value, from, to, kind) {
  const t = TABLES[kind];
  if (!t) throw new Error("Unknown kind of unit");
  if (!(from in t) || !(to in t)) throw new Error(`Units for ${kind}: ${Object.keys(t).join(", ")}`);
  return (value * t[from]) / t[to];
}

/** Trim floating-point noise (0.1+0.2 style) without hiding real precision. */
export const tidy = n => (Number.isFinite(n) ? Number(n.toPrecision(12)) : n);
