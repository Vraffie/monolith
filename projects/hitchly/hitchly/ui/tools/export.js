import { h, download } from "../dom.js";
import { stringifyCsv } from "../lib/csv.js";

export default {
  id: "export", title: "Export links", group: "Admin", needsAuth: true, keywords: "download csv json backup migrate",
  blurb: "Download every link as JSON or CSV. Passwords are never exported. For a complete backup including click history, use Maintenance.",
  mount(root, ctx) {
    const status = h("div", { class: "muted" }), err = h("div", { class: "err", role: "alert" });
    async function all() {
      const links = [];
      for (let offset = 0; ; offset += 200) {
        const page = await ctx.api(`/api/links?limit=200&offset=${offset}`);
        links.push(...page.links); status.textContent = `Loaded ${links.length} of ${page.total}…`;
        if (offset + 200 >= page.total) return links;
      }
    }
    const run = fmt => async () => {
      err.textContent = "";
      try {
        const links = await all();
        const stamp = new Date().toISOString().slice(0, 10);
        if (fmt === "json") download(`hitchly-links-${stamp}.json`, JSON.stringify(links, null, 2), "application/json");
        else download(`hitchly-links-${stamp}.csv`, stringifyCsv([["slug", "url", "short_url", "created_at", "expires_at", "clicks", "bot_clicks", "tags", "max_visits", "protected"],
          ...links.map(l => [l.slug, l.url, l.short_url, l.created_at, l.expires_at ?? "", l.clicks, l.bot_clicks, l.tags.join(";"), l.max_visits ?? "", l.protected ? "yes" : ""])]), "text/csv");
        status.textContent = `Exported ${links.length} link${links.length === 1 ? "" : "s"}.`;
      } catch (e) { err.textContent = e.message; }
    };
    root.append(h("div", { class: "card" }, h("div", { class: "actions" }, h("button", { onclick: run("json") }, "Download JSON"), h("button", { class: "ghost", onclick: run("csv") }, "Download CSV")), status, err));
  },
};
