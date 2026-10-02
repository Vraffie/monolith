import { h } from "../dom.js";

const BATCH = 25;

export default {
  id: "checker", title: "Dead-link checker", group: "Admin", needsAuth: true, keywords: "broken links 404 health check audit",
  blurb: "Probe every short link's destination from the server and list the ones that no longer work. Redirects are followed; internal addresses are refused.",
  mount(root, ctx) {
    const status = h("div", { class: "muted" }), results = h("div"), err = h("div", { class: "err", role: "alert" });
    const run = h("button", {}, "Check all links");
    let dead = [];

    const renderDead = () => {
      results.replaceChildren();
      if (!dead.length) return;
      const boxes = dead.map(d => [d, h("input", { type: "checkbox" })]);
      const del = h("button", { class: "danger", onclick: async () => {
        const chosen = boxes.filter(([, b]) => b.checked).map(([d]) => d.slug);
        if (!chosen.length || !confirm(`Delete ${chosen.length} link(s) and their click history?`)) return;
        for (const slug of chosen) await ctx.api(`/api/links/${slug}`, { method: "DELETE" });
        dead = dead.filter(d => !chosen.includes(d.slug)); renderDead(); ctx.toast(`Deleted ${chosen.length}`);
      } }, "Delete selected");
      results.append(h("div", { class: "card" },
        h("table", {}, h("tr", {}, ["", "Slug", "Target", "Problem"].map(t => h("th", {}, t))),
          boxes.map(([d, b]) => h("tr", {}, h("td", {}, b), h("td", { class: "mono" }, d.slug), h("td", { class: "mono" }, d.url || ""), h("td", {}, d.error || `HTTP ${d.status}`)))),
        h("div", { class: "actions" }, del)));
    };

    run.addEventListener("click", async () => {
      err.textContent = ""; dead = []; results.replaceChildren(); run.disabled = true;
      try {
        const slugs = [];
        for (let offset = 0; ; offset += 200) {
          const page = await ctx.api(`/api/links?limit=200&offset=${offset}`);
          slugs.push(...page.links.map(l => l.slug));
          if (offset + 200 >= page.total) break;
        }
        if (!slugs.length) { status.textContent = "No links to check."; return; }
        let done = 0;
        for (let i = 0; i < slugs.length; i += BATCH) {
          const { results: batch } = await ctx.api("/api/links/check", { method: "POST", body: JSON.stringify({ slugs: slugs.slice(i, i + BATCH) }) });
          dead.push(...batch.filter(r => !r.ok));
          done += batch.length; status.textContent = `Checked ${done} of ${slugs.length}…`;
        }
        status.textContent = `Checked ${slugs.length} link${slugs.length === 1 ? "" : "s"}: ${slugs.length - dead.length} ok, ${dead.length} with problems.`;
        renderDead();
      } catch (e) { err.textContent = e.message; }
      finally { run.disabled = false; }
    });
    root.append(h("div", { class: "card" }, h("div", { class: "actions" }, run), status, err), results);
  },
};
