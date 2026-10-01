import { parseCsvObjects, stringifyCsv } from "./csv.js";
import { parseYaml, toYaml } from "./yaml.js";
import { parseXml, toXml } from "./xml.js";

const cell = v => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);

/** JSON array of objects → CSV text. Columns are the union of keys in first-seen order; nested values become JSON. */
export function jsonToCsv(value, { delimiter = ",", safe = false } = {}) {
  const rows = Array.isArray(value) ? value : [value];
  if (!rows.length) return "";
  if (!rows.every(r => r && typeof r === "object" && !Array.isArray(r))) throw new Error("CSV needs a JSON array of objects (or a single object)");
  const cols = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  return stringifyCsv([cols, ...rows.map(r => cols.map(c => cell(r[c])))], { delimiter, safe });
}

const infer = s => (s === "" ? "" : s === "true" ? true : s === "false" ? false : s === "null" ? null : /^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?$/.test(s) && Number.isFinite(Number(s)) && !/^-?\d{16,}$/.test(s) ? Number(s) : s);

/** CSV text → array of objects. With `types`, numbers/booleans/null are converted; otherwise every value stays a string. */
export function csvToJson(text, { delimiter = ",", types = true } = {}) {
  const { header, rows } = parseCsvObjects(text, delimiter);
  if (!header.length) return [];
  return rows.map(r => Object.fromEntries(header.map(h => [h, types ? infer(r[h]) : r[h]])));
}

export const FORMATS = {
  json: { parse: t => JSON.parse(t), write: v => JSON.stringify(v, null, 2) + "\n" },
  yaml: { parse: parseYaml, write: v => toYaml(v) },
  xml: { parse: parseXml, write: v => toXml(v) },
  csv: { parse: t => csvToJson(t), write: v => jsonToCsv(v) },
};

export function convert(text, from, to) {
  if (from === to) throw new Error("Pick two different formats");
  if (!FORMATS[from] || !FORMATS[to]) throw new Error("Unknown format");
  let value;
  try { value = FORMATS[from].parse(text); }
  catch (e) { throw new Error(`Could not read the input as ${from.toUpperCase()}: ${e.message}`); }
  return FORMATS[to].write(value);
}
