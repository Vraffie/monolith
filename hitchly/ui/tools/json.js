import { h, field, textarea, select, output } from "../dom.js";
import { format, minify } from "../lib/json.js";

export default {
  id: "json", title: "JSON formatter", group: "Format & convert", keywords: "pretty print minify validate sort keys",
  blurb: "Validate, pretty-print or minify JSON, with line and column for errors.",
  mount(root) {
    const src = textarea({ placeholder: '{"paste":"json here"}' });
    const mode = select([{ value: "fmt", label: "Pretty-print" }, { value: "min", label: "Minify" }]);
    const indent = select([{ value: "2", label: "2 spaces" }, { value: "4", label: "4 spaces" }, { value: "tab", label: "Tab" }]);
    const sort = h("input", { type: "checkbox" });
    const out = output(), status = h("div", { class: "muted" });
    const run = () => {
      if (!src.value.trim()) { out.set(""); status.textContent = ""; status.className = "muted"; return; }
      const r = mode.value === "min" ? minify(src.value, { sort: sort.checked }) : format(src.value, { indent: indent.value === "tab" ? "tab" : Number(indent.value), sort: sort.checked });
      if (r.ok) { out.set(r.text); status.className = "ok"; status.textContent = `Valid JSON · ${new TextEncoder().encode(r.text).length} bytes`; }
      else { out.set(""); status.className = "err"; status.textContent = r.error + (r.line ? ` (line ${r.line}, column ${r.column})` : ""); }
    };
    for (const el of [src, mode, indent, sort]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("Input", src), h("div", { class: "inline" }, field("Mode", mode), field("Indent", indent), h("label", {}, sort, "Sort keys")), status),
      h("div", { class: "card" }, h("label", {}, "Output"), out));
  },
};
