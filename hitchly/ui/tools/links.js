import { h, field, input, select, copyText, toast, debounce } from "../dom.js";

const fmt = ts => new Date(ts * 1000).toLocaleString();

export default {
  id: "links",
  title: "Short links",
  group: "Links",
  blurb: "Create, search, edit and track short links.",
  keywords: "url shortener shorten link redirect",
  needsAuth: true,
  mount(root, ctx) {
    const err = h("span", { class: "err", role: "alert" });
    const url = input({ type: "url", placeholder: "https://example.com/a/very/long/path", required: true });
    const slug = input({ placeholder: "my-link", pattern: "[A-Za-z0-9_\\-]{3,32}" });
    const ttl = select([{ value: "", label: "Never" }, { value: "3600", label: "1 hour" }, { value: "86400", label: "1 day" },
                        { value: "604800", label: "1 week" }, { value: "2592000", label: "30 days" }]);
    const tags = input({ placeholder: "docs, launch" });
    const max = input({ type: "number", min: "1", placeholder: "unlimited" });
    const pw = input({ type: "password", autocomplete: "new-password", minlength: "4", maxlength: "128" });
    const search = input({ type: "search", placeholder: "Search slug, URL or #tag", "aria-label": "Search links" });
    const list = h("div");
    const empty = h("div", { class: "meta", hidden: true }, "No links yet.");

    const prefilled = ctx.takePrefill();
    if (prefilled) { url.value = prefilled; setTimeout(() => url.focus(), 0); }

    async function load() {
      const term = search.value.trim();
      const q = new URLSearchParams({ limit: 100 });
      if (term.startsWith("#")) q.set("tag", term.slice(1)); else if (term) q.set("q", term);
      const { links } = await ctx.api("/api/links?" + q);
      list.replaceChildren();
      empty.hidden = links.length > 0;
      for (const l of links) list.append(row(l));
    }

    function row(l) {
      const extra = h("div", { class: "stats" });
      const toggle = (name, build) => async () => {
        if (extra.dataset.open === name) { extra.replaceChildren(); extra.dataset.open = ""; return; }
        extra.replaceChildren(); extra.dataset.open = name;
        try { await build(extra); } catch (e) { extra.textContent = e.message; }
      };
      const stats = toggle("stats", async box => {
        const s = await ctx.api(`/api/links/${l.slug}/stats?days=7`);
        const peak = Math.max(1, ...s.clicks_per_day.map(d => d.clicks));
        box.append(h("div", {}, `${s.total_clicks} visits` + (s.bot_clicks ? ` (+${s.bot_clicks} bot, excluded)` : "") + ". Last 7 days:"));
        if (!s.clicks_per_day.length) box.append(h("div", { class: "meta" }, "No visits in the last 7 days."));
        for (const d of s.clicks_per_day) {
          const bar = h("span", { class: "bar" }); bar.style.width = (d.clicks / peak * 120 + 4) + "px";
          box.append(h("div", {}, bar, `${d.day}: ${d.clicks}`));
        }
        if (s.top_referrers.length) box.append(h("div", { class: "meta" }, "Top referrers: " + s.top_referrers.map(r => `${r.referrer} (${r.clicks})`).join(", ")));
      });
      const qr = toggle("qr", async box => {
        const svg = await ctx.api(`/api/links/${l.slug}/qr.svg`);
        const img = h("img", { alt: "QR code for " + l.short_url, width: 200, height: 200 });
        img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
        box.append(img);
      });
      const edit = async () => {
        const target = prompt("Destination URL:", l.url);
        if (target === null) return;
        const hours = prompt("Expires after N hours from now (blank = keep, 0 = never):", "");
        if (hours === null) return;
        const body = { url: target };
        if (hours.trim() !== "") body.ttl_seconds = Number(hours) > 0 ? Math.round(Number(hours) * 3600) : null;
        try { await ctx.api(`/api/links/${l.slug}`, { method: "PATCH", body: JSON.stringify(body) }); load(); }
        catch (e) { alert(e.message); }
      };
      const del = async () => {
        if (!confirm(`Delete ${l.slug}?`)) return;
        await ctx.api(`/api/links/${l.slug}`, { method: "DELETE" }); load();
      };
      const metaText = `${l.clicks} clicks` + (l.bot_clicks ? ` (+${l.bot_clicks} bot)` : "") + ` · created ${fmt(l.created_at)}` +
        (l.expires_at ? (l.expired ? " · EXPIRED" : ` · expires ${fmt(l.expires_at)}`) : "") +
        (l.protected ? " · password protected" : "") +
        (l.max_visits ? ` · limit ${l.max_visits}` + (l.exhausted ? " (used up)" : "") : "");
      return h("div", { class: "link" },
        h("div", { class: "row" },
          h("a", { class: "short", href: l.short_url, target: "_blank", rel: "noopener" }, l.short_url),
          h("div", { class: "actions" },
            h("button", { class: "ghost small", onclick: () => copyText(l.short_url) }, "Copy"),
            h("button", { class: "ghost small", onclick: stats }, "Stats"),
            h("button", { class: "ghost small", onclick: qr }, "QR"),
            h("button", { class: "ghost small", onclick: edit }, "Edit"),
            h("button", { class: "danger small", onclick: del }, "Delete"))),
        h("div", { class: "target" }, l.url),
        l.tags.length ? h("div", { class: "meta" }, l.tags.map(t => "#" + t).join(" ")) : null,
        h("div", { class: "meta" }, metaText),
        extra);
    }

    const form = h("form", {
      class: "card grid",
      onsubmit: async e => {
        e.preventDefault(); err.textContent = "";
        const body = { url: url.value };
        if (slug.value) body.slug = slug.value;
        if (ttl.value) body.ttl_seconds = Number(ttl.value);
        const tagList = tags.value.split(",").map(t => t.trim()).filter(Boolean);
        if (tagList.length) body.tags = tagList;
        if (max.value) body.max_visits = Number(max.value);
        if (pw.value) body.password = pw.value;
        try {
          const link = await ctx.api("/api/links", { method: "POST", body: JSON.stringify(body) });
          form.reset(); toast("Created " + link.short_url); await copyText(link.short_url); load();
        } catch (ex) { err.textContent = ex.message; }
      },
    },
    field("Long URL", url, "full"),
    field("Custom slug (optional)", slug), field("Expires after", ttl),
    field("Max visits (optional)", max), field("Password (optional)", pw),
    field("Tags (comma separated, optional)", tags, "full"),
    h("div", { class: "full row" }, h("button", {}, "Shorten"), err));

    search.addEventListener("input", debounce(() => load().catch(() => {}), 250));
    const bookmarklet = h("a", { class: "short", href: "#", onclick: e => e.preventDefault() }, "Hitch this page");
    bookmarklet.setAttribute("href", "javascript:(function(){location.href=" + JSON.stringify(location.origin + "/#new=") + "+encodeURIComponent(location.href)})()");

    root.append(form,
      h("details", { class: "card" }, h("summary", {}, "Bookmarklet: shorten the page you are on"),
        h("p", { class: "meta" }, "Drag this to your bookmarks bar, then click it on any page. It opens Hitchly with the page URL filled in. " +
          "(Sites with a strict Content-Security-Policy block bookmarklets; copy the URL manually there.)"), bookmarklet),
      h("div", { class: "card" }, search, list, empty));
    load().catch(e => { err.textContent = e.message; });
  },
};
