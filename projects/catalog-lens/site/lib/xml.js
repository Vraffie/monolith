// A small XML reader for the catalogue files: elements, attributes, text, comments, CDATA, entities.
// Namespaces are ignored (prefixes are dropped) because every file uses the one default namespace. No DTDs or external entities: they are skipped, never resolved.
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m; }
  return ENT[e] ?? m;
});
const local = n => n.slice(n.indexOf(":") + 1);
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>|<\/\s*([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export class XmlError extends Error {}

/** Parse a document into { name, attrs, kids, text }. `kids` holds child elements only; `text` is the element's own trimmed text. */
export function parseXml(src) {
  const root = { name: "#root", attrs: {}, kids: [], text: "" }, stack = [root];
  let m, parts = [""];
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[7]) throw new XmlError(`Unexpected "<" at offset ${m.index}`);
    if (m[1] !== undefined) { parts[parts.length - 1] += m[1]; continue; }
    if (m[2] !== undefined) {
      const name = local(m[2]);
      if (stack.length === 1 || top.name !== name) throw new XmlError(`Unexpected closing tag </${name}>` + (stack.length > 1 ? ` (expected </${top.name}>)` : ""));
      top.text = parts.pop().trim(); stack.pop(); continue;
    }
    if (m[3] !== undefined) {
      const el = { name: local(m[3]), attrs: {}, kids: [], text: "" };
      for (const a of (m[4] || "").matchAll(ATTR)) el.attrs[local(a[1])] = decode(a[2] ?? a[3]);
      top.kids.push(el);
      if (m[5]) continue;
      stack.push(el); parts.push(""); continue;
    }
    if (m[6] !== undefined) parts[parts.length - 1] += decode(m[6]);
  }
  if (stack.length !== 1) throw new XmlError(`Unclosed element <${stack[stack.length - 1].name}>`);
  if (root.kids.length !== 1) throw new XmlError(root.kids.length ? "More than one root element" : "No root element");
  return root.kids[0];
}

export const kids = (n, name) => (n ? n.kids.filter(k => k.name === name) : []);
export const kid = (n, name) => (n ? n.kids.find(k => k.name === name) : undefined);
export const txt = (n, name) => { const k = kid(n, name); return k ? k.text : undefined; };
