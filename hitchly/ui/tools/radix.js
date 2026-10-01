import { h, field, input, select, output } from "../dom.js";
import { convertAll } from "../lib/radix.js";

export default {
  id: "radix", title: "Number base converter", group: "Format & convert", keywords: "binary hex octal decimal base36 bigint",
  blurb: "Convert integers between binary, octal, decimal, hexadecimal and base 36. Arbitrarily large numbers are exact.",
  mount(root) {
    const src = input({ value: "255", placeholder: "255, ff, 0b1010 …" });
    const base = select([{ value: "10", label: "Decimal (10)" }, { value: "16", label: "Hexadecimal (16)" }, { value: "2", label: "Binary (2)" }, { value: "8", label: "Octal (8)" }, { value: "36", label: "Base 36" }]);
    const table = h("div"), err = h("div", { class: "err", role: "alert" });
    const names = { 2: "Binary", 8: "Octal", 10: "Decimal", 16: "Hexadecimal", 36: "Base 36" };
    const run = () => {
      err.textContent = ""; table.replaceChildren();
      try { for (const [b, v] of Object.entries(convertAll(src.value, Number(base.value)))) table.append(h("div", { class: "card" }, h("label", {}, names[b]), output(v))); }
      catch (e) { err.textContent = e.message; }
    };
    src.addEventListener("input", run); base.addEventListener("input", run);
    root.append(h("div", { class: "card grid" }, field("Number", src), field("Input base", base), h("div", { class: "full" }, err)), table);
    run();
  },
};
