/** Myers O(ND) diff over arbitrary token arrays, plus line/word/char helpers, unified output and a JSON structural diff. */

const MAX_TOKENS = 6000;

/** @returns {{type:"eq"|"add"|"del", ai?:number, bi?:number}[]} an edit script turning `a` into `b` with the fewest edits. */
export function myers(a, b) {
  const n = a.length, m = b.length, max = n + m;
  if (max > MAX_TOKENS) throw new Error(`Inputs are too large to diff in the browser (${max} tokens, limit ${MAX_TOKENS}). Try diffing by lines, or split the text.`);
  if (!n && !m) return [];
  const offset = max + 1, v = new Int32Array(2 * max + 3), trace = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));  // only the band that can change at depth d
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  throw new Error("diff failed");  // unreachable: depth max always suffices
}

function backtrack(trace, n, m) {
  const ops = [];
  let x = n, y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vv = trace[d], at = k => vv[k + d + 1], k = x - y;
    const prevK = (k === -d || (k !== d && at(k - 1) < at(k + 1))) ? k + 1 : k - 1;
    const prevX = at(prevK), prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ type: "eq", ai: x - 1, bi: y - 1 }); x--; y--; }
    if (d > 0) ops.push(x === prevX ? { type: "add", bi: y - 1 } : { type: "del", ai: x - 1 });
    x = prevX; y = prevY;
  }
  return ops.reverse();
}

export const tokenize = (text, mode) =>
  mode === "chars" ? Array.from(text) : mode === "words" ? text.split(/(\s+)/).filter(s => s !== "") : text.split("\n");

/** Rows for display: {type, text, left, right} with 1-based line numbers (lines mode) or token positions. */
export function diffRows(a, b, mode = "lines") {
  const A = tokenize(a, mode), B = tokenize(b, mode), rows = [];
  let l = 0, r = 0;
  for (const op of myers(A, B)) {
    if (op.type === "eq") rows.push({ type: "eq", text: A[op.ai], left: ++l, right: ++r });
    else if (op.type === "del") rows.push({ type: "del", text: A[op.ai], left: ++l, right: null });
    else rows.push({ type: "add", text: B[op.bi], left: null, right: ++r });
  }
  return rows;
}

export function stats(rows) {
  return { added: rows.filter(r => r.type === "add").length, removed: rows.filter(r => r.type === "del").length, unchanged: rows.filter(r => r.type === "eq").length };
}

/** Standard unified diff text (what `diff -u` prints), with `context` unchanged lines around each change. */
export function unified(a, b, { context = 3, from = "a", to = "b" } = {}) {
  const rows = diffRows(a, b, "lines");
  if (!rows.some(r => r.type !== "eq")) return "";
  const out = [`--- ${from}`, `+++ ${to}`], keep = new Array(rows.length).fill(false);
  rows.forEach((r, i) => { if (r.type !== "eq") for (let j = Math.max(0, i - context); j <= Math.min(rows.length - 1, i + context); j++) keep[j] = true; });
  for (let i = 0; i < rows.length;) {
    if (!keep[i]) { i++; continue; }
    let j = i;
    while (j < rows.length && keep[j]) j++;
    const hunk = rows.slice(i, j);
    const lStart = hunk.find(r => r.left)?.left ?? (rows.slice(0, i).filter(r => r.left).length), rStart = hunk.find(r => r.right)?.right ?? (rows.slice(0, i).filter(r => r.right).length);
    const lLen = hunk.filter(r => r.left).length, rLen = hunk.filter(r => r.right).length;
    out.push(`@@ -${lLen ? lStart : lStart},${lLen} +${rLen ? rStart : rStart},${rLen} @@`);
    for (const r of hunk) out.push((r.type === "eq" ? " " : r.type === "add" ? "+" : "-") + r.text);
    i = j;
  }
  return out.join("\n") + "\n";
}

// ---- JSON structural diff ----------------------------------------------------------------
const typeOf = v => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
const isObj = v => typeOf(v) === "object";
const keyPath = (p, k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? `${p}.${k}` : `${p}[${JSON.stringify(k)}]`);

/** Differences between two parsed JSON values. Object key order is ignored; arrays are compared by index. */
export function jsonDiff(a, b, path = "$") {
  if (isObj(a) && isObj(b)) {
    const out = [];
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (!(k in b)) out.push({ path: keyPath(path, k), kind: "removed", from: a[k] });
      else if (!(k in a)) out.push({ path: keyPath(path, k), kind: "added", to: b[k] });
      else out.push(...jsonDiff(a[k], b[k], keyPath(path, k)));
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const out = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= b.length) out.push({ path: `${path}[${i}]`, kind: "removed", from: a[i] });
      else if (i >= a.length) out.push({ path: `${path}[${i}]`, kind: "added", to: b[i] });
      else out.push(...jsonDiff(a[i], b[i], `${path}[${i}]`));
    }
    return out;
  }
  return JSON.stringify(a) === JSON.stringify(b) && typeOf(a) === typeOf(b) ? [] : [{ path, kind: "changed", from: a, to: b }];
}
