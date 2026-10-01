import { h, field, input, output, copyText } from "../dom.js";
import { buildUtm, lintUtm, UTM_FIELDS } from "../lib/utm.js";

export default {
  id: "utm", title: "UTM builder", group: "QR & URLs", keywords: "campaign tracking google analytics link tagging",
  blurb: "Add campaign parameters to a URL. Existing query strings and #fragments are kept. Shorten the result with one click.",
  mount(root, ctx) {
    const base = input({ type: "url", placeholder: "https://example.com/landing" });
    const inputs = Object.fromEntries(UTM_FIELDS.map(f => [f, input({ placeholder: f === "source" ? "newsletter (required)" : "" })]));
    const out = output(), tips = h("div", { class: "muted" }), err = h("div", { class: "err", role: "alert" });
    const short = h("button", { class: "ghost", hidden: true }, "Shorten this URL");
    const run = () => {
      err.textContent = ""; tips.replaceChildren(); short.hidden = true;
      if (!base.value.trim()) { out.set(""); return; }
      try {
        const values = Object.fromEntries(UTM_FIELDS.map(f => [f, inputs[f].value]));
        out.set(buildUtm(base.value, values));
        tips.replaceChildren(...lintUtm(values).map(t => h("div", {}, "Tip: " + t)));
        short.hidden = false;
      } catch (e) { out.set(""); err.textContent = e.message; }
    };
    short.addEventListener("click", () => { location.hash = "#new=" + encodeURIComponent(out.get()); });
    for (const el of [base, ...Object.values(inputs)]) el.addEventListener("input", run);
    root.append(h("div", { class: "card grid" }, field("Page URL", base, "full"), ...UTM_FIELDS.map(f => field("utm_" + f, inputs[f])), h("div", { class: "full" }, err)),
      h("div", { class: "card" }, out, tips, h("div", { class: "actions" }, short)));
  },
};
