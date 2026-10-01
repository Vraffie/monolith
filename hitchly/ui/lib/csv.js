/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, CRLF, UTF-8 BOM. */
export function parseCsv(text, delimiter = ",") {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = "", quoted = false, i = 0;
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) endField();
    else if (ch === "\n") endRow();
    else if (ch === "\r") { if (text[i + 1] === "\n") i++; endRow(); }
    else field += ch;
    i++;
  }
  if (quoted) throw new Error("A quoted field is never closed");
  if (field !== "" || row.length) endRow();
  return rows.filter(r => !(r.length === 1 && r[0] === ""));
}

/** Rows as objects keyed by the header row. */
export function parseCsvObjects(text, delimiter = ",") {
  const [header, ...rest] = parseCsv(text, delimiter);
  if (!header) return { header: [], rows: [] };
  return { header, rows: rest.map(r => Object.fromEntries(header.map((h, k) => [h, r[k] ?? ""]))) };
}

/** Quote when needed. With `safe`, cells starting with = + - @ or a tab get a leading ' so spreadsheets don't run them as formulas. */
export function stringifyCsv(rows, { delimiter = ",", safe = true } = {}) {
  const cell = v => {
    let s = v == null ? "" : String(v);
    if (safe && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /["\n\r]/.test(s) || s.includes(delimiter) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return rows.map(r => r.map(cell).join(delimiter)).join("\r\n") + "\r\n";
}
