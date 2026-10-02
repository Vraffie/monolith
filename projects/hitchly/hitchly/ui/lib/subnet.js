/** IPv4 and IPv6 address maths with BigInt: CIDR calculator, compression, and range → minimal CIDR list. */
export function parseIPv4(text) {
  const p = text.trim().split(".");
  if (p.length !== 4 || !p.every(x => /^(0|[1-9]\d{0,2})$/.test(x) && +x <= 255)) throw new Error(`'${text.trim()}' is not a valid IPv4 address`);
  return p.reduce((a, x) => (a << 8n) + BigInt(x), 0n);
}
export const formatIPv4 = n => [24n, 16n, 8n, 0n].map(s => (n >> s) & 255n).join(".");

export function parseIPv6(text) {
  let s = text.trim().toLowerCase().replace(/%.*$/, "");  // drop a zone id
  if (!s || /[^0-9a-f:.]/.test(s)) throw new Error(`'${text.trim()}' is not a valid IPv6 address`);
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) { const n = parseIPv4(v4[1]); s = s.slice(0, -v4[1].length) + (n >> 16n).toString(16) + ":" + (n & 0xffffn).toString(16); }
  const halves = s.split("::");
  if (halves.length > 2) throw new Error(`'${text.trim()}' is not a valid IPv6 address (more than one ::)`);
  const side = h => (h === "" ? [] : h.split(":"));
  const head = side(halves[0]), tail = halves.length === 2 ? side(halves[1]) : [];
  const fill = 8 - head.length - tail.length;
  if ((halves.length === 1 && head.length !== 8) || (halves.length === 2 && fill < 1)) throw new Error(`'${text.trim()}' is not a valid IPv6 address (wrong number of groups)`);
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...tail];
  if (!groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) throw new Error(`'${text.trim()}' is not a valid IPv6 address`);
  return groups.reduce((a, g) => (a << 16n) + BigInt("0x" + g), 0n);
}

/** RFC 5952 canonical form: lower case, longest run of zero groups (length >= 2) compressed, first run wins ties. */
export function formatIPv6(n, { expand = false } = {}) {
  const g = Array.from({ length: 8 }, (_, i) => Number((n >> BigInt(112 - 16 * i)) & 0xffffn));
  if (expand) return g.map(x => x.toString(16).padStart(4, "0")).join(":");
  let best = [-1, 0], i = 0;
  while (i < 8) { if (g[i] === 0) { let j = i; while (j < 8 && g[j] === 0) j++; if (j - i > best[1]) best = [i, j - i]; i = j; } else i++; }
  const hex = g.map(x => x.toString(16));
  if (best[1] < 2) return hex.join(":");
  return hex.slice(0, best[0]).join(":") + "::" + hex.slice(best[0] + best[1]).join(":");
}

/** Analyse "address/prefix" (or a bare address) for either IP version. */
export function cidr(text) {
  const [addr, pre, extra] = text.trim().split("/");
  if (extra !== undefined) throw new Error("Use the form address/prefix, e.g. 192.168.1.0/24");
  const v6 = addr.includes(":"), bits = v6 ? 128 : 32;
  const ip = v6 ? parseIPv6(addr) : parseIPv4(addr);
  const prefix = pre === undefined ? bits : (/^\d+$/.test(pre) ? +pre : NaN);
  if (!(prefix >= 0 && prefix <= bits)) throw new Error(`Prefix must be a number from 0 to ${bits}`);
  const hostBits = BigInt(bits - prefix), size = 1n << hostBits, full = (1n << BigInt(bits)) - 1n;
  const mask = full ^ (size - 1n), network = ip & mask, last = network | (size - 1n);
  const fmt = v6 ? formatIPv6 : formatIPv4;
  const out = { version: v6 ? 6 : 4, address: fmt(ip), prefix, network: fmt(network), first: fmt(network), last: fmt(last), total: size, mask: v6 ? formatIPv6(mask) : formatIPv4(mask) };
  if (!v6) {
    out.wildcard = formatIPv4(full ^ mask);
    out.broadcast = formatIPv4(last);
    // /31 (point to point, RFC 3021) and /32 have no network/broadcast addresses to exclude
    out.usable = prefix >= 31 ? size : size - 2n;
    if (prefix < 31) { out.first = formatIPv4(network + 1n); out.last = formatIPv4(last - 1n); }
    out.binaryMask = [...Array(4)].map((_, i) => ((mask >> BigInt(24 - 8 * i)) & 255n).toString(2).padStart(8, "0")).join(".");
    const first = Number(ip >> 24n);
    out.class = first < 128 ? "A" : first < 192 ? "B" : first < 224 ? "C" : first < 240 ? "D (multicast)" : "E (reserved)";
    out.private = [["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16]].some(([n, p]) => (ip >> BigInt(32 - p)) === (parseIPv4(n) >> BigInt(32 - p)));
  } else out.expanded = formatIPv6(ip, { expand: true });
  return out;
}

/** Smallest list of CIDR blocks covering exactly [start, end] (inclusive). */
export function rangeToCidrs(startText, endText) {
  const v6 = startText.includes(":") || endText.includes(":");
  if (startText.includes(":") !== endText.includes(":")) throw new Error("Start and end must both be IPv4 or both IPv6");
  const bits = v6 ? 128n : 32n, parse = v6 ? parseIPv6 : parseIPv4, fmt = v6 ? formatIPv6 : formatIPv4;
  let a = parse(startText); const b = parse(endText);
  if (a > b) throw new Error("The start address is after the end address");
  const out = [];
  while (a <= b) {
    let size = a === 0n ? 1n << bits : a & -a;                   // largest block aligned at `a`
    while (a + size - 1n > b) size >>= 1n;                        // ...that still fits inside the range
    let prefix = bits; for (let s = size; s > 1n; s >>= 1n) prefix--;
    out.push(`${fmt(a)}/${prefix}`);
    a += size;
  }
  return out;
}
