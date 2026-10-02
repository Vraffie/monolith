/** ULID: 48-bit millisecond timestamp + 80 bits of randomness, Crockford Base32, lexicographically sortable. */
const C = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MAX_TIME = 2 ** 48 - 1;

export function encodeTime(ms) {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_TIME) throw new Error("Timestamp must be a whole number of milliseconds between 0 and 2^48-1");
  let s = "";
  for (let i = 0; i < 10; i++) { s = C[ms % 32] + s; ms = Math.floor(ms / 32); }
  return s;
}

export function encodeRandom(bytes) {
  if (bytes.length !== 10) throw new Error("Need 10 random bytes");
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = "";
  for (let i = 0; i < 16; i++) { s = C[Number(n & 31n)] + s; n >>= 5n; }
  return s;
}

export function ulid(now = Date.now(), rand = a => crypto.getRandomValues(a)) {
  return encodeTime(now) + encodeRandom(rand(new Uint8Array(10)));
}

export function decodeUlid(text) {
  const s = text.trim().toUpperCase();
  if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(s)) throw new Error("Not a valid ULID (26 characters of 0-9 A-Z without I, L, O, U; the first must be 0-7)");
  let ms = 0;
  for (const ch of s.slice(0, 10)) ms = ms * 32 + C.indexOf(ch);
  return { timestamp: ms, iso: new Date(ms).toISOString(), randomness: s.slice(10) };
}
