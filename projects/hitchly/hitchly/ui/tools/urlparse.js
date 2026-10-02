import { h, field, input, output } from "../dom.js";
import { parseUrl, cleanUrl } from "../lib/urlparse.js";

export default {
  id: "url-parser", title: "URL parser & cleaner", group: "QR & URLs", keywords: "query parameters tracking fbclid utm strip clean",
  blurb: "Take a URL apart, and strip tracking parameters (utm_*, fbclid, gclid, …) before you share or shorten it.",
  mount(root) {
    const src = input({ type: "url", placeholder: "https://example.com/page?utm_source=x&id=7#top" });
    const frag = h("input", { type: "checkbox" }), sort = h("input", { type: "checkbox" });
    const cleaned = output(), info = h("div", { class: "muted" }), parts = h("table"), params = h("table"), err = h("div", { class: "err", role: "alert" });
    const run = () => {
      err.textContent = ""; parts.replaceChildren(); params.replaceChildren(); cleaned.set(""); info.textContent = "";
      if (!src.value.trim()) return;
      try {
        const p = parseUrl(src.value);
        for (const k of ["protocol", "username", "password", "hostname", "port", "path", "hash"]) if (p[k]) parts.append(h("tr", {}, h("th", {}, k), h("td", { class: "mono" }, p[k])));
        for (const q of p.params) params.append(h("tr", {}, h("td", { class: "mono" }, q.key), h("td", { class: "mono" }, q.value), h("td", {}, q.tracking ? h("span", { class: "pill bad" }, "tracking") : "")));
        const c = cleanUrl(src.value, { removeFragment: frag.checked, sortParams: sort.checked });
        cleaned.set(c.url); info.textContent = c.removed ? `Removed ${c.removed} tracking parameter${c.removed === 1 ? "" : "s"}.` : "No tracking parameters found.";
      } catch (e) { err.textContent = e.message; }
    };
    for (const el of [src, frag, sort]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("URL", src), h("div", { class: "inline" }, h("label", {}, frag, "Remove #fragment"), h("label", {}, sort, "Sort parameters")), err),
      h("div", { class: "card" }, h("label", {}, "Cleaned URL"), cleaned, info), h("div", { class: "card" }, parts), h("div", { class: "card" }, h("label", {}, "Query parameters"), params));
  },
};
