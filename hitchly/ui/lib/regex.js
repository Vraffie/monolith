/** Run a regex over text and list matches. Pure; the UI runs it in a Worker so a runaway pattern can be killed. */
export function runRegex(pattern, flags, text, limit = 500) {
  let re;
  try { re = new RegExp(pattern, flags.includes("g") ? flags : flags + "g"); }
  catch (e) { return { ok: false, error: e.message }; }
  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null && matches.length < limit) {
    matches.push({ index: m.index, text: m[0], groups: [...m].slice(1), named: m.groups ? { ...m.groups } : null });
    if (m[0] === "") re.lastIndex++; // zero-length match: step forward or we would loop forever
  }
  return { ok: true, matches, truncated: matches.length >= limit };
}
