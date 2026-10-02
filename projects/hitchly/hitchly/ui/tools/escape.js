import { h, field, textarea, select, output } from "../dom.js";
import { htmlEncode, htmlDecode, jsEscape, jsUnescape, jsonEscape, jsonUnescape, sqlEscape } from "../lib/entities.js";

const MODES = {
  html: { label: "HTML entities", enc: (t, o) => htmlEncode(t, { all: o }), dec: htmlDecode, opt: "Also encode every non-ASCII character" },
  js: { label: "JavaScript string", enc: (t, o) => jsEscape(t, { ascii: o }), dec: jsUnescape, opt: "Escape non-ASCII as \\u sequences" },
  json: { label: "JSON string", enc: t => jsonEscape(t), dec: jsonUnescape },
  sql: { label: "SQL string literal", enc: t => sqlEscape(t), dec: t => t.replace(/''/g, "'"), note: "Doubles single quotes. Use parameterised queries in real code; escaping is not a substitute." },
};

export default {
  id: "escape", title: "Escape & unescape", group: "Encode & decode", keywords: "html entities javascript json sql quotes backslash",
  blurb: "Escape text for HTML, JavaScript or JSON strings and SQL literals, or turn escaped text back into plain text.",
  mount(root) {
    const src = textarea({ placeholder: "Text…" }), mode = select(Object.entries(MODES).map(([value, m]) => ({ value, label: m.label }))), dir = select([{ value: "enc", label: "Escape" }, { value: "dec", label: "Unescape" }]);
    const optBox = h("input", { type: "checkbox" }), optLabel = h("label", {}, optBox, ""), note = h("div", { class: "muted" }), out = output(), err = h("div", { class: "err", role: "alert" });
    const run = () => {
      const m = MODES[mode.value]; err.textContent = ""; optLabel.hidden = !m.opt || dir.value === "dec"; optLabel.lastChild.textContent = m.opt || ""; note.textContent = m.note || "";
      try { out.set(dir.value === "enc" ? m.enc(src.value, optBox.checked) : m.dec(src.value)); } catch (e) { out.set(""); err.textContent = e.message; }
    };
    for (const el of [src, mode, dir, optBox]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("Input", src), h("div", { class: "inline" }, field("Format", mode), field("Direction", dir), optLabel), note, err), h("div", { class: "card" }, h("label", {}, "Output"), out));
    run();
  },
};
