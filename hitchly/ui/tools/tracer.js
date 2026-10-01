import { h, field, input } from "../dom.js";

export default {
  id: "tracer", title: "Redirect tracer", group: "QR & URLs", needsAuth: true, keywords: "unshorten expand redirect chain where does this link go preview title",
  blurb: "See where a link really goes before you click it: every redirect hop, the final page's title and the HTTP status. Fetched by your Hitchly server, which refuses internal addresses.",
  mount(root, ctx) {
    const url = input({ type: "url", placeholder: "https://bit.ly/…  or any link" });
    const go = h("button", {}, "Trace");
    const out = h("div"), err = h("div", { class: "err", role: "alert" });
    const pill = s => h("span", { class: "pill " + (s && s < 400 ? "good" : "bad") }, s ? String(s) : "error");
    const run = async e => {
      e?.preventDefault(); err.textContent = ""; out.replaceChildren();
      if (!url.value.trim()) return;
      go.disabled = true; go.textContent = "Tracing…";
      try {
        const r = await ctx.api("/api/tools/trace", { method: "POST", body: JSON.stringify({ url: url.value.trim() }) });
        const rows = r.hops.map((hop, i) => h("tr", {}, h("td", {}, i + 1), h("td", {}, pill(hop.status)), h("td", { class: "mono" }, hop.url), h("td", {}, hop.ms == null ? "" : hop.ms + " ms")));
        out.append(h("div", { class: "card" }, h("p", {}, h("strong", {}, r.ok ? "Reachable" : "Problem: " + r.error), r.hops.length > 1 ? ` · ${r.hops.length - 1} redirect${r.hops.length === 2 ? "" : "s"}` : ""),
          rows.length ? h("table", {}, h("tr", {}, ["#", "Status", "URL", "Time"].map(t => h("th", {}, t))), rows) : null),
          r.final ? h("div", { class: "card" }, h("div", { class: "muted" }, "Final destination"), h("div", { class: "mono" }, r.final.url),
            r.final.title ? h("p", {}, h("strong", {}, r.final.title)) : null, r.final.description ? h("p", { class: "muted" }, r.final.description) : null,
            h("div", { class: "muted" }, r.final.content_type)) : null);
      } catch (ex) { err.textContent = ex.message; }
      finally { go.disabled = false; go.textContent = "Trace"; }
    };
    root.append(h("form", { class: "card", onsubmit: run }, field("URL", url), h("div", { class: "actions" }, go), err), out);
  },
};
