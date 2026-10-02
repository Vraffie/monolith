const BS = String.fromCharCode(92);  // one backslash, spelled out so no editor or tool can mangle it
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", yen: "¥", cent: "¢",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", bull: "•", middot: "·",
  deg: "°", plusmn: "±", times: "×", divide: "÷", frac12: "½", larr: "←", rarr: "→", uarr: "↑", darr: "↓", hearts: "♥", check: "✓" };

/** `all` also encodes every non-ASCII character as a numeric reference. */
export function htmlEncode(text, { all = false } = {}) {
  let out = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  if (all) out = Array.from(out, ch => (ch.codePointAt(0) > 126 ? `&#${ch.codePointAt(0)};` : ch)).join("");
  return out;
}

export function htmlDecode(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
    if (e[0] === "#") {
      const cp = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1);
      // NUL, lone surrogates and out-of-range values are not characters: leave the reference as written
      if (!(cp >= 1 && cp <= 0x10ffff) || (cp >= 0xd800 && cp <= 0xdfff)) return m;
      return String.fromCodePoint(cp);
    }
    return e in NAMED ? NAMED[e] : m;  // unknown names are left alone rather than guessed
  });
}

const SIMPLE = { "\n": "n", "\r": "r", "\t": "t", "\b": "b", "\f": "f", "\v": "v", "\0": "0" };
/** Escape for a JavaScript/JSON-style string literal (without the surrounding quotes). */
export function jsEscape(text, { quote = '"', ascii = false } = {}) {
  return Array.from(text, ch => {
    if (ch === BS) return BS + BS;
    if (ch === quote) return BS + ch;
    if (SIMPLE[ch]) return BS + SIMPLE[ch];
    const cp = ch.codePointAt(0);
    if (cp < 32 || cp === 127 || (ascii && cp > 126)) return cp > 0xffff ? BS + "u{" + cp.toString(16) + "}" : BS + "u" + cp.toString(16).padStart(4, "0");
    return ch;
  }).join("");
}

export function jsUnescape(text) {
  return text.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[nrtbfv0'"\\\/])/g, (m, e) => {
    if (e[0] === "u") { const hex = e[1] === "{" ? e.slice(2, -1) : e.slice(1); try { return String.fromCodePoint(parseInt(hex, 16)); } catch { throw new Error(`Invalid code point in ${m}`); } }
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", 0: "\0" }[e] ?? e;
  });
}

export const jsonEscape = text => JSON.stringify(text).slice(1, -1);
export function jsonUnescape(text) {
  try { return JSON.parse('"' + text + '"'); } catch { throw new Error("Not a valid JSON string body (check for an unescaped quote or a bad escape)"); }
}

/** SQL string literal escaping: single quotes are doubled. (Use parameterised queries in real code.) */
export const sqlEscape = text => text.replace(/'/g, "''");
