/** Map rows from another service's export onto Hitchly link payloads. Mirrors `hitch import` (hitchctl/cli.py). */
export const DEFAULT_COLUMNS = { url: "url", slug: "slug", ttl_seconds: "ttl_seconds", tags: "tags", max_visits: "max_visits" };

const splitTags = v => (Array.isArray(v) ? v : String(v || "").split(/[;,]/)).map(t => String(t).trim()).filter(Boolean);

/**
 * @returns {{items: {row:number, payload:object}[], problems: {row:number, error:string}[]}}
 * `row` is the 1-based data-row number in the file. Rows without a URL or with a non-numeric number go to `problems`.
 */
export function mapRows(rows, columns = DEFAULT_COLUMNS, { slugLastSegment = false, defaultTags = [] } = {}) {
  const cols = { ...DEFAULT_COLUMNS, ...columns }, items = [], problems = [];
  rows.forEach((r, i) => {
    const row = i + 1, url = typeof r[cols.url] === "string" ? r[cols.url].trim() : "";
    if (!url) { problems.push({ row, error: `missing '${cols.url}'` }); return; }
    const payload = { url };
    let slug = r[cols.slug] ? String(r[cols.slug]).trim() : "";
    if (slug && slugLastSegment) slug = slug.replace(/\/+$/, "").split("/").pop();
    if (slug) payload.slug = slug;
    for (const [field, key] of [["ttl_seconds", cols.ttl_seconds], ["max_visits", cols.max_visits]]) {
      const raw = r[key];
      if (raw === undefined || raw === null || raw === "") continue;
      if (!/^\d+$/.test(String(raw).trim())) { problems.push({ row, error: `${key} must be a whole number` }); return; }
      payload[field] = Number(raw);
    }
    const tags = [...splitTags(r[cols.tags]), ...defaultTags];
    if (tags.length) payload.tags = tags;
    items.push({ row, payload });
  });
  return { items, problems };
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
