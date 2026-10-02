/**
 * A small YAML reader/writer for the part of YAML that configuration files actually use.
 *
 * Supported: block mappings and sequences, nesting by spaces, plain/'single'/"double" quoted scalars, null/true/false/numbers,
 * flow [a, b] and {a: 1}, comments, `|` and `>` block scalars (with - and + chomping), a leading `---`.
 * NOT supported (and reported as errors, never guessed): anchors &x, aliases *x, tags !!x, merge keys <<, `? ` complex keys,
 * multiple documents, tab indentation. Dates stay strings (YAML 1.2 core schema).
 */
class YamlError extends Error {}
const fail = (line, msg) => { throw new YamlError(`Line ${line}: ${msg}`); };

const NUM_INT = /^[-+]?(0|[1-9]\d*)$/, NUM_FLOAT = /^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/;

function scalar(text, line) {
  const t = text.trim();
  if (t === "" || t === "~" || /^(null|Null|NULL)$/.test(t)) return null;
  if (/^(true|True|TRUE)$/.test(t)) return true;
  if (/^(false|False|FALSE)$/.test(t)) return false;
  if (t[0] === '"') {
    if (t.length < 2 || t[t.length - 1] !== '"') fail(line, "unterminated double-quoted string");
    try { return JSON.parse(t); } catch { fail(line, "unsupported escape in double-quoted string"); }
  }
  if (t[0] === "'") {
    if (t.length < 2 || t[t.length - 1] !== "'") fail(line, "unterminated single-quoted string");
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (t[0] === "&" || t[0] === "*") fail(line, "anchors and aliases are not supported");
  if (t[0] === "!") fail(line, "tags are not supported");
  if (t[0] === "[" || t[0] === "{") return flow(t, line);
  if (NUM_INT.test(t)) { const n = Number(t); return Number.isSafeInteger(n) ? n : t; }  // huge integers stay exact as strings
  if (NUM_FLOAT.test(t)) return Number(t);
  if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
  if (/^0o[0-7]+$/.test(t)) return parseInt(t.slice(2), 8);
  return t;
}

/** Flow collections: [1, "a", {k: v}] */
function flow(text, line) {
  let i = 0;
  const skip = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const value = () => {
    skip();
    if (text[i] === "[") {
      i++; const arr = [];
      for (;;) { skip(); if (text[i] === "]") { i++; return arr; } arr.push(value()); skip(); if (text[i] === ",") i++; else if (text[i] !== "]") fail(line, "expected , or ] in a flow sequence"); }
    }
    if (text[i] === "{") {
      i++; const obj = {};
      for (;;) {
        skip(); if (text[i] === "}") { i++; return obj; }
        const key = token(":,}]"); skip();
        if (text[i] !== ":") fail(line, "expected : in a flow mapping");
        i++; obj[String(scalar(key, line))] = value(); skip();
        if (text[i] === ",") i++; else if (text[i] !== "}") fail(line, "expected , or } in a flow mapping");
      }
    }
    return scalar(token(",]}"), line);
  };
  const token = stops => {
    skip();
    if (text[i] === '"' || text[i] === "'") {
      const q = text[i]; let j = i + 1;
      while (j < text.length && !(text[j] === q && !(q === '"' && text[j - 1] === "\\") && !(q === "'" && text[j + 1] === "'" && (j++, true)))) j++;
      const s = text.slice(i, j + 1); i = j + 1; return s;
    }
    let j = i;
    while (j < text.length && !stops.includes(text[j])) j++;
    const s = text.slice(i, j); i = j; return s.trim();
  };
  const v = value(); skip();
  if (i < text.length) fail(line, "unexpected text after a flow collection");
  return v;
}

function stripComment(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q && !(q === '"' && s[i - 1] === "\\")) q = null; else if (q === "'" && c === "'" && s[i + 1] === "'") i++; }
    else if (c === '"' || c === "'") { if (i === 0 || /[\s:\[{,-]/.test(s[i - 1])) q = c; }
    else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

/** Index of the `:` that ends a mapping key (followed by space or end of line), ignoring quoted keys; -1 if none. */
function keyEnd(s) {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if ((c === '"' || c === "'") && i === 0) q = c;
    else if (c === ":" && (i === s.length - 1 || s[i + 1] === " ")) return i;
    else if ((c === "[" || c === "{") && i === 0) return -1;  // a flow value, not a key
  }
  return -1;
}

export function parseYaml(source) {
  const tabAt = source.search(/^ *\t/m);
  if (tabAt >= 0) fail(source.slice(0, tabAt).split("\n").length, "tabs cannot be used for indentation");
  const raw = source.replace(/\r\n?/g, "\n").split("\n");
  const lines = [];  // {indent, text, no, raw}
  raw.forEach((r, idx) => {
    const text = stripComment(r);
    if (text.trim() === "") { lines.push({ blank: true, raw: r, no: idx + 1 }); return; }
    lines.push({ indent: r.length - r.trimStart().length, text: text.trim(), no: idx + 1, raw: r });
  });
  let p = 0;
  const content = () => { while (p < lines.length && lines[p].blank) p++; return lines[p]; };
  const first = content();
  if (!first) return null;
  if (first.text === "---") { p++; }
  else if (first.text.startsWith("--- ")) fail(first.no, "put content on the lines after '---'");
  const rest = content();
  if (!rest) return null;
  const value = parseBlock(rest.indent);
  const tail = content();
  if (tail) fail(tail.no, tail.text === "---" || tail.text === "..." ? "multiple documents are not supported" : "unexpected content (check the indentation)");
  return value;

  function blockScalar(header, parentIndent, no) {
    const folded = header[0] === ">", chomp = header.includes("-") ? "strip" : header.includes("+") ? "keep" : "clip";
    const body = [];
    let indent = null;
    while (p < lines.length) {
      const l = lines[p];
      if (l.blank) { body.push(""); p++; continue; }
      const ind = l.raw.length - l.raw.trimStart().length;
      if (ind <= parentIndent) break;
      if (indent === null) indent = ind;
      if (ind < indent) fail(l.no, "inconsistent indentation in a block scalar");
      body.push(l.raw.slice(indent)); p++;
    }
    let trailing = 0;
    while (body.length && body[body.length - 1] === "") { body.pop(); trailing++; }
    let text;
    if (!folded) text = body.join("\n");
    else {  // folding: single newlines become spaces, each blank line becomes one newline, more-indented lines keep their breaks
      text = ""; let pending = 0, prev = null;
      for (const line of body) {
        if (line === "") { pending++; continue; }
        if (prev === null) text = line;
        else if (pending) text += "\n".repeat(pending) + line;
        else text += (/^\s/.test(line) || /^\s/.test(prev) ? "\n" : " ") + line;
        pending = 0; prev = line;
      }
    }
    if (chomp === "clip") text += body.length ? "\n" : "";
    else if (chomp === "keep") text += "\n".repeat(trailing + (body.length ? 1 : 0));
    if (indent === null && no) return "";
    return text;
  }

  function parseBlock(indent) {
    const l = content();
    if (!l || l.indent < indent) return null;
    if (l.text.startsWith("? ")) fail(l.no, "complex keys are not supported");
    if (l.text === "-" || l.text.startsWith("- ")) return parseSeq(l.indent);
    if (keyEnd(l.text) >= 0) return parseMap(l.indent);
    p++;
    const next = content();
    if (next && next.indent > l.indent) fail(next.no, "unexpected indentation after a plain value");
    return scalar(l.text, l.no);
  }

  function parseSeq(indent) {
    const out = [];
    for (;;) {
      const l = content();
      if (!l || l.indent !== indent || !(l.text === "-" || l.text.startsWith("- "))) {
        if (l && l.indent > indent) fail(l.no, "bad indentation inside a sequence");
        return out;
      }
      const after = l.text === "-" ? "" : l.text.slice(2).trim();
      if (after === "") { p++; const n = content(); out.push(n && n.indent > indent ? parseBlock(n.indent) : null); }
      else if (after[0] === "|" || after[0] === ">") { p++; out.push(blockScalar(after, indent, l.no)); }
      else if (after === "-" || after.startsWith("- ")) {  // "- - x": a sequence nested directly in a sequence item
        const col = indent + (l.text.length - after.length);
        lines[p] = { ...l, indent: col, text: after };
        out.push(parseSeq(col));
      } else if (keyEnd(after) >= 0 && after[0] !== "[" && after[0] !== "{") {
        // "- key: value" starts a mapping whose keys line up two columns in
        const col = indent + (l.text.length - after.length);
        lines[p] = { ...l, indent: col, text: after };
        out.push(parseMap(col));
      } else { p++; out.push(scalar(after, l.no)); }
    }
  }

  function parseMap(indent) {
    const out = {};
    for (;;) {
      const l = content();
      if (!l || l.indent !== indent) {
        if (l && l.indent > indent) fail(l.no, "bad indentation (a value is indented more than its key)");
        return out;
      }
      if (l.text.startsWith("? ")) fail(l.no, "complex keys are not supported");
      if (l.text === "---" || l.text === "...") fail(l.no, "multiple documents are not supported");
      const e = keyEnd(l.text);
      if (e < 0) { if (l.text === "-" || l.text.startsWith("- ")) return out; fail(l.no, "expected 'key: value'"); }
      const keyText = l.text.slice(0, e).trim(), rest = l.text.slice(e + 1).trim();
      if (keyText === "<<") fail(l.no, "merge keys (<<) are not supported");
      const key = String(scalar(keyText, l.no));
      if (Object.prototype.hasOwnProperty.call(out, key)) fail(l.no, `duplicate key '${key}'`);
      p++;
      if (rest === "") {
        const n = content();
        if (n && n.indent > indent) out[key] = parseBlock(n.indent);
        else if (n && n.indent === indent && (n.text === "-" || n.text.startsWith("- "))) out[key] = parseSeq(indent);  // "key:\n- a" at the same indent
        else out[key] = null;
      } else if (rest[0] === "|" || rest[0] === ">") out[key] = blockScalar(rest, indent, l.no);
      else out[key] = scalar(rest, l.no);
    }
  }
}

// ---- writer -----------------------------------------------------------------------------------
const RESERVED = /^(null|Null|NULL|~|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/;
function needsQuotes(s) {
  return s === "" || RESERVED.test(s) || NUM_INT.test(s) || NUM_FLOAT.test(s) || /^0[xo]/i.test(s) || /^\s|\s$/.test(s) || /[\n\r\t]/.test(s) ||
    /^[-?:,\[\]{}#&*!|>'"%@`]/.test(s) || /: |:$| #/.test(s) || /^---|^\.\.\./.test(s);
}
const str = s => (needsQuotes(s) ? JSON.stringify(s) : s);

export function toYaml(value, indent = 2) {
  const pad = n => " ".repeat(n);
  const isPlainEmpty = v => (Array.isArray(v) && !v.length) || (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
  const inline = v => (v === null || v === undefined ? "null" : typeof v === "string" ? str(v) : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "null") : typeof v === "boolean" ? String(v) : Array.isArray(v) ? "[]" : "{}");
  function emit(v, level) {
    if (Array.isArray(v)) {
      return v.map(item => {
        if (item && typeof item === "object" && !isPlainEmpty(item)) {
          const inner = emit(item, level + indent).split("\n");
          return pad(level) + "- " + inner[0].trimStart() + (inner.length > 1 ? "\n" + inner.slice(1).join("\n") : "");
        }
        return `${pad(level)}- ${inline(item)}`;
      }).join("\n");
    }
    return Object.keys(v).map(k => {
      const val = v[k], key = str(k);
      if (val && typeof val === "object" && !isPlainEmpty(val)) return `${pad(level)}${key}:\n${emit(val, level + indent)}`;
      return `${pad(level)}${key}: ${inline(val)}`;
    }).join("\n");
  }
  if (value && typeof value === "object" && !isPlainEmpty(value)) return emit(value, 0) + "\n";
  return inline(value) + "\n";
}
