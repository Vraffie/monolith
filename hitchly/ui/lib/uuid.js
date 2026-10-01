const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
const format = h => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));

export function uuidv4(rand = randomBytes) {
  const b = rand(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return format(hex(b));
}

/** RFC 9562 UUIDv7: 48-bit Unix ms timestamp, then random bits. Sorts by creation time. */
export function uuidv7(now = Date.now(), rand = randomBytes) {
  const b = rand(16);
  let t = BigInt(now);
  for (let i = 5; i >= 0; i--) { b[i] = Number(t & 0xffn); t >>= 8n; }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  return format(hex(b));
}

const RE = /^[0-9a-f]{8}-[0-9a-f]{4}-([0-9a-f])[0-9a-f]{3}-([89ab])[0-9a-f]{3}-[0-9a-f]{12}$/i;

export function inspect(text) {
  const m = RE.exec(text.trim());
  if (!m) return null;
  const version = parseInt(m[1], 16);
  const out = { version, variant: "RFC 4122/9562" };
  if (version === 7) out.timestamp = new Date(parseInt(text.trim().replace(/-/g, "").slice(0, 12), 16)).toISOString();
  return out;
}
