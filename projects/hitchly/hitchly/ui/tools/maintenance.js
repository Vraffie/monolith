import { h } from "../dom.js";

export default {
  id: "maintenance", title: "Maintenance", group: "Admin", needsAuth: true, keywords: "backup purge expired stats overview database status",
  blurb: "Server status, removing expired links, and downloading a full database backup.",
  mount(root, ctx) {
    const stats = h("div", { class: "grid" }), msg = h("div", { class: "muted" }), err = h("div", { class: "err", role: "alert" });
    const card = (label, value) => h("div", { class: "card" }, h("div", { class: "muted" }, label), h("div", { class: "mono" }, String(value)));
    async function refresh() {
      try {
        const o = await ctx.api("/api/overview");
        stats.replaceChildren(card("Links", o.links), card("Expired (not yet purged)", o.expired_links), card("Human visits", o.clicks), card("Bot visits", o.bot_clicks),
          card("Version", `${o.version} (schema v${o.schema_version})`), card("Probes may reach private addresses", o.probes_allow_private ? "yes: SSRF guard off" : "no"));
      } catch (e) { err.textContent = e.message; }
    }
    const purge = h("button", { class: "danger", onclick: async () => {
      if (!confirm("Delete all expired links and their click history?")) return;
      err.textContent = ""; try { const r = await ctx.api("/api/purge", { method: "POST", body: "{}" }); msg.textContent = `Removed ${r.removed} expired link(s).`; refresh(); } catch (e) { err.textContent = e.message; }
    } }, "Purge expired links");
    const backup = h("button", { onclick: async () => {
      err.textContent = "";
      try {
        const blob = await ctx.blob("/api/backup");
        const a = h("a", { href: URL.createObjectURL(blob), download: `hitchly-backup-${new Date().toISOString().slice(0, 10)}.db` });
        document.body.append(a); a.click(); a.remove(); msg.textContent = `Backup downloaded (${blob.size} bytes). It contains password hashes and all click data: keep it private.`;
      } catch (e) { err.textContent = e.message; }
    } }, "Download backup");
    root.append(stats, h("div", { class: "card" }, h("div", { class: "actions" }, backup, purge), msg, err));
    refresh();
  },
};
