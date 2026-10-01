/** A strict little XML reader/writer for data conversion. No DTDs/entities beyond the five standard + numeric (so no entity-expansion tricks). */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = s => s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e) => {
  if (e[0] === "#") { const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : +e.slice(1); try { return String.fromCodePoint(cp); } catch { throw new Error(`Invalid character reference ${m}`); } }
  if (!(e in ENT)) throw new Error(`Unknown entity ${m} (only &amp; &lt; &gt; &quot; &apos; and numeric references are supported)`);
  return ENT[e];
});
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = s => esc(s).replace(/"/g, "&quot;");
const NAME = /^[A-Za-z_][\w.\-:]*$/;

/** Parse XML into a JSON-friendly tree: {tag: {"@attr": "v", "#text": "...", child: ...}}; repeated children become arrays. */
export function parseXml(src) {
  let i = 0;
  const err = msg => { const line = src.slice(0, i).split("\n").length; throw new Error(`XML error on line ${line}: ${msg}`); };
  const skipMisc = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith("<?", i)) { const e = src.indexOf("?>", i); if (e < 0) err("unterminated <? ?>"); i = e + 2; }
      else if (src.startsWith("<!--", i)) { const e = src.indexOf("-->", i); if (e < 0) err("unterminated comment"); i = e + 3; }
      else if (src.startsWith("<!DOCTYPE", i) || src.startsWith("<!ENTITY", i)) err("DOCTYPE and entity declarations are not supported");
      else return;
    }
  };
  function element() {
    if (src[i] !== "<") err("expected an element");
    i++;
    const m = /^[A-Za-z_][\w.\-:]*/.exec(src.slice(i));
    if (!m) err("invalid element name");
    const tag = m[0]; i += tag.length;
    const node = {};
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] === "/" && src[i + 1] === ">") { i += 2; return [tag, finish(node, [])]; }
      if (src[i] === ">") { i++; break; }
      const a = /^([A-Za-z_][\w.\-:]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(src.slice(i));
      if (!a) err(`malformed attribute in <${tag}>`);
      if (("@" + a[1]) in node) err(`duplicate attribute ${a[1]}`);
      node["@" + a[1]] = decode(a[3] ?? a[4]); i += a[0].length;
    }
    const kids = []; let text = "";
    for (;;) {
      if (i >= src.length) err(`unclosed <${tag}>`);
      if (src.startsWith("</", i)) {
        const e = src.indexOf(">", i); const close = src.slice(i + 2, e).trim();
        if (close !== tag) err(`</${close}> does not match <${tag}>`);
        i = e + 1; break;
      }
      if (src.startsWith("<!--", i)) { const e = src.indexOf("-->", i); if (e < 0) err("unterminated comment"); i = e + 3; }
      else if (src.startsWith("<![CDATA[", i)) { const e = src.indexOf("]]>", i); if (e < 0) err("unterminated CDATA"); text += src.slice(i + 9, e); i = e + 3; }
      else if (src.startsWith("<?", i)) { const e = src.indexOf("?>", i); if (e < 0) err("unterminated <? ?>"); i = e + 2; }
      else if (src[i] === "<") kids.push(element());
      else { const e = src.indexOf("<", i); const chunk = src.slice(i, e < 0 ? src.length : e); text += decode(chunk); i += chunk.length; }
    }
    return [tag, finish(node, kids, text)];
  }
  function finish(node, kids, text = "") {
    const counts = new Map();
    for (const [k] of kids) counts.set(k, (counts.get(k) || 0) + 1);
    for (const [k, v] of kids) { if (counts.get(k) > 1) (node[k] ||= []).push(v); else node[k] = v; }  // repeated element => array
    const trimmed = text.trim();
    if (!Object.keys(node).length) return trimmed;  // text-only element is just its string
    if (trimmed) node["#text"] = trimmed;
    return node;
  }
  skipMisc();
  const [tag, value] = element();
  skipMisc();
  if (i < src.length) err("content after the root element");
  return { [tag]: value };
}

const safeName = k => {
  if (NAME.test(k)) return k;
  const n = k.replace(/[^\w.\-:]/g, "_");
  return /^[A-Za-z_]/.test(n) ? n : "_" + n;  // names cannot start with a digit, dot or hyphen
};

/** JSON → XML. Keys starting with "@" become attributes, "#text" is text, arrays repeat the element. */
export function toXml(value, { root = "root", indent = 2, declaration = true } = {}) {
  const pad = n => " ".repeat(n);
  function el(tag, v, level) {
    tag = safeName(tag);
    if (Array.isArray(v)) return v.map(x => el(tag, x, level)).join("\n");
    if (v === null || v === undefined) return `${pad(level)}<${tag}/>`;
    if (typeof v !== "object") return `${pad(level)}<${tag}>${esc(v)}</${tag}>`;
    const attrs = Object.keys(v).filter(k => k[0] === "@").map(k => ` ${safeName(k.slice(1))}="${escAttr(v[k])}"`).join("");
    const kids = Object.keys(v).filter(k => k[0] !== "@" && k !== "#text");
    const text = v["#text"] === undefined ? "" : esc(v["#text"]);
    if (!kids.length) return text ? `${pad(level)}<${tag}${attrs}>${text}</${tag}>` : `${pad(level)}<${tag}${attrs}/>`;
    return `${pad(level)}<${tag}${attrs}>${text ? "\n" + pad(level + indent) + text : ""}\n${kids.map(k => el(k, v[k], level + indent)).join("\n")}\n${pad(level)}</${tag}>`;
  }
  const body = value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && Object.keys(value)[0][0] !== "@" && Object.keys(value)[0] !== "#text"
    ? el(Object.keys(value)[0], Object.values(value)[0], 0) : el(root, value, 0);
  return (declaration ? '<?xml version="1.0" encoding="UTF-8"?>\n' : "") + body + "\n";
}
