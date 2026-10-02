import { h, field, input, textarea } from "../dom.js";
import { parseCsvObjects } from "../lib/csv.js";
import { mapRows, chunk, DEFAULT_COLUMNS } from "../lib/importmap.js";

export default {
  id: "import", title: "Import links", group: "Admin", needsAuth: true, keywords: "csv json migrate bitly yourls kutt shlink bulk",
  blurb: "Load links from a CSV or JSON export (for example from another shortener). Map your column names, try a dry run first, and failed rows are listed with the reason.",
  mount(root, ctx) {
    const file = h("input", { type: "file", accept: ".csv,.json,.txt,text/csv,application/json" });
    const paste = textarea({ placeholder: "…or paste CSV / JSON here" });
    const delimiter = input({ value: ",", maxlength: "1" });
    const cols = Object.fromEntries(Object.entries(DEFAULT_COLUMNS).map(([k, v]) => [k, input({ value: v })]));
    const lastSeg = h("input", { type: "checkbox" }), dry = h("input", { type: "checkbox", checked: true });
    const defTags = input({ placeholder: "imported" });
    const go = h("button", {}, "Run"), status = h("div", { class: "muted" }), err = h("div", { class: "err", role: "alert" }), report = h("div");

    file.addEventListener("change", async () => { if (file.files[0]) paste.value = await file.files[0].text(); });
    const parse = () => {
      const text = paste.value.trim();
      if (!text) throw new Error("Choose a file or paste some data first");
      if (text.startsWith("[") || text.startsWith("{")) {
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error("JSON must be a list of objects");
        return data;
      }
      const { header, rows } = parseCsvObjects(text, delimiter.value || ",");
      if (!header.includes(cols.url.value)) throw new Error(`No '${cols.url.value}' column. Found: ${header.join(", ")}. Set the URL column name below.`);
      return rows;
    };
    const run = async () => {
      err.textContent = ""; report.replaceChildren(); status.textContent = ""; go.disabled = true;
      try {
        const rows = parse();
        const { items, problems } = mapRows(rows, Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, c.value.trim() || DEFAULT_COLUMNS[k]])),
          { slugLastSegment: lastSeg.checked, defaultTags: defTags.value.split(",").map(t => t.trim()).filter(Boolean) });
        let created = 0, skipped = 0;
        const failures = problems.map(p => ({ row: p.row, error: p.error }));
        if (dry.checked) { status.textContent = `Dry run: ${items.length} of ${rows.length} rows would be sent, ${problems.length} cannot be imported. Nothing was created.`; }
        else {
          let done = 0;
          for (const part of chunk(items, 200)) {
            const res = await ctx.api("/api/links/bulk", { method: "POST", body: JSON.stringify({ links: part.map(i => i.payload) }) });
            for (const r of res.results) {
              if (r.link) created++;
              else if (r.status === 409) skipped++; // slug already exists: not an error for a re-run
              else failures.push({ row: part[r.index].row, error: r.error });
            }
            done += part.length; status.textContent = `Sent ${done} of ${items.length}…`;
          }
          status.textContent = `Done: ${created} created, ${skipped} skipped (slug already existed), ${failures.length} failed.`;
        }
        if (failures.length) {
          failures.sort((a, b) => a.row - b.row);
          report.append(h("div", { class: "card" }, h("table", {}, h("tr", {}, ["Row", "Problem"].map(t => h("th", {}, t))),
            failures.slice(0, 200).map(f => h("tr", {}, h("td", {}, f.row), h("td", {}, f.error)))), failures.length > 200 ? h("p", { class: "muted" }, `…and ${failures.length - 200} more`) : null));
        }
      } catch (e) { err.textContent = e.message; }
      finally { go.disabled = false; }
    };
    go.addEventListener("click", run);
    root.append(h("div", { class: "card grid" }, field("File", file, "full"), field("Data", paste, "full"),
      field("CSV delimiter", delimiter), field("Tag every imported link with", defTags),
      ...Object.entries(cols).map(([k, c]) => field(`Column for ${k}`, c)),
      h("div", { class: "full inline" }, h("label", {}, lastSeg, "Slug column holds a short URL (keep the last path segment)"), h("label", {}, dry, "Dry run (don't create anything)")),
      h("div", { class: "full actions" }, go), h("div", { class: "full" }, status, err)), report);
  },
};
