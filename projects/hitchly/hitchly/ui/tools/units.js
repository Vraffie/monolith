import { h, field, input, select, output } from "../dom.js";
import { toRoman, fromRoman, percentOf, whatPercent, percentChange, temperature, convertUnit, TABLES, tidy } from "../lib/units.js";

const KINDS = { roman: "Roman numerals", percent: "Percentages", temperature: "Temperature", length: "Length", mass: "Mass", data: "Data size", time: "Time" };

export default {
  id: "units", title: "Unit, percentage & Roman numeral converters", group: "Format & convert", keywords: "convert length weight temperature celsius fahrenheit bytes percent roman",
  blurb: "Everyday conversions: length, mass, temperature, data sizes (KB vs KiB), time, percentages and Roman numerals.",
  mount(root) {
    const kind = select(Object.entries(KINDS).map(([value, label]) => ({ value, label }))), box = h("div", { class: "card" }), result = output(), err = h("div", { class: "err", role: "alert" });
    const show = fn => { err.textContent = ""; try { result.set(fn()); } catch (e) { result.set(""); err.textContent = e.message; } };
    const build = () => {
      box.replaceChildren(); result.set(""); err.textContent = ""; const k = kind.value;
      if (k === "roman") {
        const v = input({ value: "1994", "aria-label": "Number or Roman numeral" });
        const go = () => show(() => (/^\d+$/.test(v.value.trim()) ? toRoman(Number(v.value)) : String(fromRoman(v.value))));
        v.addEventListener("input", go); box.append(field("Number (1-3999) or Roman numeral", v)); go();
      } else if (k === "percent") {
        const a = input({ type: "number", value: "15" }), b = input({ type: "number", value: "200" }), m = select([{ value: "of", label: "A% of B" }, { value: "what", label: "A is what % of B" }, { value: "change", label: "% change from A to B" }]);
        const go = () => show(() => { const x = Number(a.value), y = Number(b.value); return tidy(m.value === "of" ? percentOf(x, y) : m.value === "what" ? whatPercent(x, y) : percentChange(x, y)) + (m.value === "of" ? "" : "%"); });
        for (const el of [a, b, m]) el.addEventListener("input", go); box.append(h("div", { class: "grid" }, field("Calculation", m, "full"), field("A", a), field("B", b))); go();
      } else {
        const units = k === "temperature" ? ["C", "F", "K"] : Object.keys(TABLES[k]);
        const v = input({ type: "number", value: "1", step: "any" }), f = select(units), t = select(units); t.value = units[1];
        const go = () => show(() => { const n = Number(v.value); if (!Number.isFinite(n)) throw new Error("Enter a number"); return tidy(k === "temperature" ? temperature(n, f.value, t.value) : convertUnit(n, f.value, t.value, k)) + " " + t.value; });
        for (const el of [v, f, t]) el.addEventListener("input", go); box.append(h("div", { class: "grid3" }, field("Value", v), field("From", f), field("To", t)),
          k === "data" ? h("p", { class: "muted" }, "KB, MB, GB… are powers of 1000; KiB, MiB, GiB… are powers of 1024.") : null); go();
      }
    };
    kind.addEventListener("input", build);
    root.append(h("div", { class: "card" }, field("Converter", kind)), box, h("div", { class: "card" }, result, err));
    build();
  },
};
