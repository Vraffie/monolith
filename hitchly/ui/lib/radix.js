const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

export function parseInBase(text, base) {
  if (!Number.isInteger(base) || base < 2 || base > 36) throw new RangeError("Base must be between 2 and 36");
  let s = text.trim().toLowerCase().replace(/[_\s]/g, "");
  let neg = false;
  if (s.startsWith("-")) { neg = true; s = s.slice(1); }
  if (base === 16) s = s.replace(/^0x/, "");
  if (base === 2) s = s.replace(/^0b/, "");
  if (base === 8) s = s.replace(/^0o/, "");
  if (!s) throw new Error("Enter a number");
  let n = 0n;
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) throw new Error(`'${ch}' is not a valid base-${base} digit`);
    n = n * BigInt(base) + BigInt(d);
  }
  return neg ? -n : n;
}

export function formatInBase(n, base) {
  if (!Number.isInteger(base) || base < 2 || base > 36) throw new RangeError("Base must be between 2 and 36");
  return n.toString(base);
}

export const convertAll = (text, from) => {
  const n = parseInBase(text, from);
  return { 2: formatInBase(n, 2), 8: formatInBase(n, 8), 10: formatInBase(n, 10), 16: formatInBase(n, 16), 36: formatInBase(n, 36) };
};
