// Pick the part of a repository to analyse: a folder path (prefix match on whole path segments).
export const cleanScope = s => (s ?? "").trim().replace(/\\/g, "/").replace(/^\.?\/+|\/+$/g, "");

/** Files whose path is the scope itself or below it. An empty scope means everything. Matching is on whole segments: "ab" does not match "abc/x". */
export function scopeFiles(files, scope) {
  const s = cleanScope(scope);
  if (!s) return files;
  const out = new Map();
  for (const [path, data] of files) if (path === s || path.startsWith(s + "/") || path.includes("/" + s + "/") || path.endsWith("/" + s)) out.set(path, data);
  return out;
}

/** Every folder that holds at least one XML file below it, as suggestions for the scope box (shortest first, capped). */
export function folderList(files, cap = 3000) {
  const dirs = new Set();
  for (const path of files.keys()) {
    if (!/\.xml$/i.test(path)) continue;
    const parts = path.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  return [...dirs].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)).slice(0, cap);
}
