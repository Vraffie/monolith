export const SETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>?/~",
};
const AMBIGUOUS = /[O0oIl1|`'"]/g;

const defaultFill = a => crypto.getRandomValues(a);

/** Uniform integer in [0, max) by rejection sampling: no modulo bias. */
export function randomInt(max, fill = defaultFill) {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError("max out of range");
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    fill(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function generate({ length = 20, sets = ["lower", "upper", "digits", "symbols"], avoidAmbiguous = false } = {}, fill = defaultFill) {
  const pools = sets.map(s => {
    if (!SETS[s]) throw new Error("Unknown character set " + s);
    return avoidAmbiguous ? SETS[s].replace(AMBIGUOUS, "") : SETS[s];
  }).filter(Boolean);
  if (!pools.length) throw new Error("Pick at least one character set");
  if (length < pools.length || length > 512) throw new RangeError(`Length must be between ${pools.length} and 512`);
  const all = pools.join("");
  const chars = pools.map(p => p[randomInt(p.length, fill)]); // at least one from every selected set
  while (chars.length < length) chars.push(all[randomInt(all.length, fill)]);
  for (let i = chars.length - 1; i > 0; i--) { // Fisher-Yates
    const j = randomInt(i + 1, fill);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return { password: chars.join(""), entropyBits: Math.round(length * Math.log2(new Set(all).size) * 10) / 10 };
}

export function randomToken(bytes = 32, format = "hex", fill = defaultFill) {
  const b = new Uint8Array(bytes);
  fill(b);
  if (format === "hex") return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  if (format === "base64url") return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  throw new Error("Unknown format " + format);
}

export function strengthLabel(bits) {
  return bits < 40 ? "weak" : bits < 60 ? "fair" : bits < 80 ? "good" : bits < 110 ? "strong" : "excellent";
}
