import { h, field, textarea, select, input, output } from "../dom.js";
import { textToBytes, bytesToText, codePoints, toNato } from "../lib/textenc.js";

export default {
  id: "textenc", title: "Text ⇄ bytes, Unicode & NATO", group: "Encode & decode", keywords: "binary hex octal decimal utf-8 utf-16 code point unicode phonetic alphabet",
  blurb: "See text as UTF-8 bytes in binary, octal, decimal or hex (and back), inspect every Unicode code point, or spell text with the NATO phonetic alphabet.",
  mount(root) {
    const mode = select([{ value: "bytes", label: "Text → bytes" }, { value: "text", label: "Bytes → text" }, { value: "cp", label: "Unicode code points" }, { value: "nato", label: "NATO alphabet" }]);
    const base = select([{ value: "16", label: "Hex" }, { value: "2", label: "Binary" }, { value: "8", label: "Octal" }, { value: "10", label: "Decimal" }]);
    const src = textarea({ placeholder: "Text or bytes…" }), out = output(), table = h("div", { class: "scroll", hidden: true }), err = h("div", { class: "err", role: "alert" });
    const run = () => {
      err.textContent = ""; out.set(""); table.replaceChildren(); table.hidden = mode.value !== "cp"; out.hidden = mode.value === "cp"; base.disabled = mode.value === "cp" || mode.value === "nato";
      try {
        if (mode.value === "bytes") out.set(textToBytes(src.value, Number(base.value)));
        else if (mode.value === "text") { if (src.value.trim()) out.set(bytesToText(src.value, Number(base.value))); }
        else if (mode.value === "nato") out.set(toNato(src.value));
        else table.append(h("table", {}, h("tr", {}, ["Char", "Code point", "UTF-8", "UTF-16", "Escape"].map(t => h("th", {}, t))),
          codePoints(src.value).slice(0, 500).map(c => h("tr", {}, h("td", {}, c.char), h("td", { class: "mono" }, c.notation), h("td", { class: "mono" }, c.utf8), h("td", { class: "mono" }, c.utf16), h("td", { class: "mono" }, c.escape)))));
      } catch (e) { err.textContent = e.message; }
    };
    for (const el of [mode, base, src]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("Input", src), h("div", { class: "inline" }, field("Mode", mode), field("Number base", base)), err), h("div", { class: "card" }, out, table));
    run();
  },
};
