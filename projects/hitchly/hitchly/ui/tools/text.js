import { h, field, textarea, output } from "../dom.js";
import { CASES, slugify, count } from "../lib/text.js";

export default {
  id: "text", title: "Text utilities", group: "Format & convert", keywords: "case camel snake kebab slug word count characters",
  blurb: "Change case, make a URL slug, and count words, characters and reading time.",
  mount(root) {
    const src = textarea({ placeholder: "Type or paste text…" });
    const cases = h("div"), stats = h("table"), slug = output();
    const run = () => {
      cases.replaceChildren(...Object.entries(CASES).map(([name, fn]) => h("div", { class: "card" }, h("label", {}, name), output(src.value ? fn(src.value) : ""))));
      slug.set(slugify(src.value));
      stats.replaceChildren(...Object.entries(count(src.value)).map(([k, v]) => h("tr", {}, h("th", {}, k.replace(/([A-Z])/g, " $1").toLowerCase()), h("td", { class: "mono" }, String(v)))));
    };
    src.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("Text", src)), h("div", { class: "card" }, h("label", {}, "URL slug (max 32 characters, matches Hitchly's slug rules)"), slug),
      h("div", { class: "card" }, stats), cases);
    run();
  },
};
