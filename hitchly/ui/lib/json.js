function locate(text, message) {
  let m = /line (\d+) column (\d+)/.exec(message);
  if (m) return { line: +m[1], column: +m[2] };
  m = /position (\d+)/.exec(message);
  if (m) {
    const pos = +m[1], before = text.slice(0, pos).split("\n");
    return { line: before.length, column: before[before.length - 1].length + 1 };
  }
  return null;
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  return v;
}

/** Returns { ok: true, value } or { ok: false, error, line?, column? }. */
export function parse(text) {
  try { return { ok: true, value: JSON.parse(text) }; }
  catch (e) { return { ok: false, error: e.message, ...(locate(text, e.message) || {}) }; }
}

export function format(text, { indent = 2, sort = false } = {}) {
  const r = parse(text);
  if (!r.ok) return r;
  return { ok: true, text: JSON.stringify(sort ? sortKeys(r.value) : r.value, null, indent === "tab" ? "\t" : indent) };
}

export function minify(text, { sort = false } = {}) {
  const r = parse(text);
  if (!r.ok) return r;
  return { ok: true, text: JSON.stringify(sort ? sortKeys(r.value) : r.value) };
}
