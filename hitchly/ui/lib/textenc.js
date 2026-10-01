const BASES = { 2: 8, 8: 3, 10: 3, 16: 2 };
const enc = new TextEncoder(), dec = new TextDecoder("utf-8", { fatal: true });

/** Text -> its UTF-8 bytes written in base 2, 8, 10 or 16, space separated and zero padded. */
export function textToBytes(text, base = 16, sep = " ") {
  if (!(base in BASES)) throw new Error("Base must be 2, 8, 10 or 16");
  return Array.from(enc.encode(text), b => b.toString(base).padStart(BASES[base], "0")).join(sep);
}

export function bytesToText(input, base = 16) {
  if (!(base in BASES)) throw new Error("Base must be 2, 8, 10 or 16");
  const digits = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-fA-F]+$/ }[base];
  const cleaned = base === 16 ? input.replace(/0x/gi, " ").replace(/[,;]/g, " ") : input.replace(/[,;]/g, " ");
  let tokens = cleaned.trim().split(/\s+/).filter(Boolean);
  // no separators at all: split into fixed-width groups
  if (tokens.length === 1 && tokens[0].length > BASES[base] && base !== 10) tokens = tokens[0].match(new RegExp(`.{1,${BASES[base]}}`, "g"));
  const bytes = tokens.map(t => {
    if (!digits.test(t)) throw new Error(`'${t}' is not a valid base-${base} number`);
    const n = parseInt(t, base);
    if (n > 255) throw new Error(`'${t}' is larger than one byte (255)`);
    return n;
  });
  try { return dec.decode(Uint8Array.from(bytes)); } catch { throw new Error("Those bytes are not valid UTF-8 text"); }
}

/** One entry per Unicode code point: U+ notation, UTF-8 and UTF-16 code units, and the JavaScript escape. */
export function codePoints(text) {
  return Array.from(text, ch => {
    const cp = ch.codePointAt(0);
    const units = []; for (let i = 0; i < ch.length; i++) units.push(ch.charCodeAt(i).toString(16).padStart(4, "0"));
    return { char: ch, cp, notation: "U+" + cp.toString(16).toUpperCase().padStart(4, "0"), utf8: Array.from(enc.encode(ch), b => b.toString(16).padStart(2, "0")).join(" "), utf16: units.join(" "), escape: "\\u{" + cp.toString(16) + "}" };
  });
}

const NATO = { a: "Alfa", b: "Bravo", c: "Charlie", d: "Delta", e: "Echo", f: "Foxtrot", g: "Golf", h: "Hotel", i: "India", j: "Juliett", k: "Kilo", l: "Lima", m: "Mike", n: "November",
  o: "Oscar", p: "Papa", q: "Quebec", r: "Romeo", s: "Sierra", t: "Tango", u: "Uniform", v: "Victor", w: "Whiskey", x: "X-ray", y: "Yankee", z: "Zulu",
  0: "Zero", 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine" };

/** Spell text with the NATO phonetic alphabet; other characters pass through, spaces become " / ". */
export function toNato(text) {
  return Array.from(text.normalize("NFD").replace(/[̀-ͯ]/g, ""), ch => (ch === " " ? "/" : NATO[ch.toLowerCase()] || ch)).join(" ");
}
