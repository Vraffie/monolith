import { h, field, input, copyText } from "../dom.js";
import { parseColor, toHex, rgbToHsl, contrast, wcag } from "../lib/color.js";

export default {
  id: "color", title: "Color converter & contrast", group: "Format & convert", keywords: "hex rgb hsl wcag accessibility",
  blurb: "Convert HEX / RGB / HSL and check WCAG contrast between a text and a background colour.",
  mount(root) {
    const fg = input({ value: "#1c1c1a" }), bg = input({ value: "#ffffff" });
    const fgPick = h("input", { type: "color", value: "#1c1c1a", "aria-label": "Pick text colour" });
    const bgPick = h("input", { type: "color", value: "#ffffff", "aria-label": "Pick background colour" });
    const panel = h("div"), err = h("div", { class: "err", role: "alert" });
    const sample = h("div", { class: "swatch" });
    const run = () => {
      err.textContent = ""; panel.replaceChildren();
      try {
        const a = parseColor(fg.value), b = parseColor(bg.value), hsl = rgbToHsl(a), r = contrast(a, b), w = wcag(r);
        sample.style.background = toHex(b); sample.style.color = toHex(a); sample.textContent = "The quick brown fox";
        sample.style.padding = "16px"; sample.style.fontSize = "1.1rem";
        const pill = (ok, label) => h("span", { class: "pill " + (ok ? "good" : "bad") }, (ok ? "✓ " : "✗ ") + label);
        const row = (k, v) => h("tr", {}, h("th", {}, k), h("td", { class: "mono" }, v), h("td", {}, h("button", { class: "ghost small", onclick: () => copyText(v) }, "Copy")));
        panel.append(h("table", {}, row("HEX", toHex(a)), row("RGB", `rgb(${a.r}, ${a.g}, ${a.b})`), row("HSL", `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`)),
          h("p", {}, h("strong", {}, `Contrast ${r.toFixed(2)}:1`)),
          h("div", { class: "inline" }, pill(w.aaNormal, "AA normal text"), pill(w.aaLarge, "AA large text"), pill(w.aaaNormal, "AAA normal"), pill(w.aaaLarge, "AAA large")));
      } catch (e) { err.textContent = e.message; }
    };
    fg.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/i.test(fg.value)) fgPick.value = fg.value; run(); });
    bg.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/i.test(bg.value)) bgPick.value = bg.value; run(); });
    fgPick.addEventListener("input", () => { fg.value = fgPick.value; run(); });
    bgPick.addEventListener("input", () => { bg.value = bgPick.value; run(); });
    root.append(h("div", { class: "card grid" }, field("Text colour", h("div", { class: "inline" }, fg, fgPick)), field("Background colour", h("div", { class: "inline" }, bg, bgPick)),
      h("div", { class: "full" }, err)), h("div", { class: "card" }, sample, panel));
    run();
  },
};
