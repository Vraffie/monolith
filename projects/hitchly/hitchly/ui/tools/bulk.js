import { h, field, input, textarea, select, download, copyText } from "../dom.js";
import { stringifyCsv } from "../lib/csv.js";

export default {
  id: "bulk", title: "Bulk shorten", group: "Links", needsAuth: true, keywords: "many urls list batch shorten csv",
  blurb: "Shorten a whole list at once: one URL per line, optionally followed by a space and a custom slug. Up to 500 per run.",
  mount(root, ctx) {
    const src = textarea({ placeholder: "https://example.com/one\nhttps://example.com/two my-slug" });
    const tags = input({ placeholder: "tags for all, comma separated (optional)" });
    const ttl = select([{ value: "", label: "Never expires" }, { value: "86400", label: "1 day" }, { value: "604800", label: "1 week" }, { value: "2592000", label: "30 days" }]);
    const go = h("button", {}, "Shorten all"), status = h("div", { class: "muted" }), err = h("div", { class: "err", role: "alert" }), out = h("div");
    go.addEventListener("click", async () => {
      err.textContent = ""; out.replaceChildren(); status.textContent = "";
      const lines = src.value.split("\n").map(l => l.trim()).filter(Boolean);
      if (!lines.length) { err.textContent = "Paste at least one URL"; return; }
      if (lines.length > 500) { err.textContent = "At most 500 URLs per run"; return; }
      const tagList = tags.value.split(",").map(t => t.trim()).filter(Boolean);
      const links = lines.map(l => { const [url, slug] = l.split(/\s+/); return { url, ...(slug ? { slug } : {}), ...(tagList.length ? { tags: tagList } : {}), ...(ttl.value ? { ttl_seconds: Number(ttl.value) } : {}) }; });
      go.disabled = true;
      try {
        const res = await ctx.api("/api/links/bulk", { method: "POST", body: JSON.stringify({ links }) });
        status.textContent = `${res.created} created, ${res.failed} failed.`;
        const rows = res.results.map(r => ({ url: links[r.index].url, short: r.link ? r.link.short_url : "", error: r.error || "" }));
        out.append(h("div", { class: "card" }, h("table", {}, h("tr", {}, ["Original", "Short link / problem"].map(t => h("th", {}, t))),
          rows.map(r => h("tr", {}, h("td", { class: "mono" }, r.url), h("td", { class: r.error ? "err mono" : "mono" }, r.short || r.error)))),
          h("div", { class: "actions" }, h("button", { class: "ghost", onclick: () => copyText(rows.filter(r => r.short).map(r => r.short).join("\n")) }, "Copy all short links"),
            h("button", { class: "ghost", onclick: () => download("short-links.csv", stringifyCsv([["original", "short", "error"], ...rows.map(r => [r.url, r.short, r.error])]), "text/csv") }, "Download CSV"))));
      } catch (e) { err.textContent = e.message; } finally { go.disabled = false; }
    });
    root.append(h("div", { class: "card grid" }, field("URLs", src, "full"), field("Tags", tags), field("Expiry", ttl), h("div", { class: "full actions" }, go), h("div", { class: "full" }, status, err)), out);
  },
};
