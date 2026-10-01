import { h, field, textarea, select, copyText } from "../dom.js";
import { diffRows, stats, unified, jsonDiff } from "../lib/diff.js";

const short = v => { const s = JSON.stringify(v); return s.length > 90 ? s.slice(0, 87) + "…" : s; };

export default {
  id: "diff", title: "Text & JSON diff", group: "Format & convert", keywords: "compare difference changes patch unified",
  blurb: "See exactly what changed between two texts, by line, word or character, or compare two JSON documents structurally (key order is ignored).",
  mount(root) {
    const a = textarea({ placeholder: "Original…" }), b = textarea({ placeholder: "Changed…" });
    const mode = select([{ value: "lines", label: "Lines" }, { value: "words", label: "Words" }, { value: "chars", label: "Characters" }, { value: "json", label: "JSON (structure)" }]);
    const out = h("div"), status = h("div", { class: "muted" }), err = h("div", { class: "err", role: "alert" });
    const copyBtn = h("button", { class: "ghost small", hidden: true }, "Copy unified diff");
    copyBtn.addEventListener("click", () => copyText(unified(a.value, b.value)));
    const run = () => {
      err.textContent = ""; out.replaceChildren(); status.textContent = ""; copyBtn.hidden = true;
      try {
        if (mode.value === "json") {
          if (!a.value.trim() || !b.value.trim()) return;
          const changes = jsonDiff(JSON.parse(a.value), JSON.parse(b.value));
          status.textContent = changes.length ? `${changes.length} difference${changes.length === 1 ? "" : "s"}` : "The documents are equal.";
          if (changes.length) out.append(h("div", { class: "scroll" }, h("table", {}, h("tr", {}, ["Path", "Change", "Before", "After"].map(t => h("th", {}, t))),
            changes.map(c => h("tr", {}, h("td", { class: "mono" }, c.path), h("td", {}, h("span", { class: "pill " + (c.kind === "added" ? "good" : c.kind === "removed" ? "bad" : "") }, c.kind)),
              h("td", { class: "mono" }, "from" in c ? short(c.from) : ""), h("td", { class: "mono" }, "to" in c ? short(c.to) : ""))))));
          return;
        }
        if (!a.value && !b.value) return;
        const rows = diffRows(a.value, b.value, mode.value), s = stats(rows);
        status.textContent = s.added || s.removed ? `+${s.added} added, −${s.removed} removed, ${s.unchanged} unchanged` : "The texts are identical.";
        if (mode.value === "lines") {
          copyBtn.hidden = !(s.added || s.removed);
          out.append(h("div", { class: "scroll" }, h("table", { class: "diff" }, rows.map(r => h("tr", { class: r.type }, h("td", { class: "ln" }, r.left ?? ""), h("td", { class: "ln" }, r.right ?? ""),
            h("td", {}, (r.type === "add" ? "+ " : r.type === "del" ? "− " : "  ") + r.text))))));
        } else out.append(h("pre", { class: "inline-diff" }, rows.map(r => (r.type === "eq" ? r.text : h("span", { class: r.type }, r.text)))));
      } catch (e) { err.textContent = e.message; }
    };
    for (const el of [a, b, mode]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, h("div", { class: "grid" }, field("Original", a), field("Changed", b)), h("div", { class: "inline" }, field("Compare by", mode), copyBtn), status, err), out);
  },
};
