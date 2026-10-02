/** Parse CSV (RFC 4180 quoting) into an array of objects keyed by the header row. Blank lines are skipped. */
export function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  const end = () => { row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") end();
    else if (c !== "\r") cur += c;
  }
  if (q) throw new Error("The CSV has an unterminated quote.");
  if (cur !== "" || row.length) end();
  if (!rows.length) return [];
  const head = rows[0].map(s => s.trim());
  return rows.slice(1).map((r, i) => Object.assign({ _line: i + 2 }, Object.fromEntries(head.map((k, j) => [k, (r[j] ?? "").trim()]))));
}
