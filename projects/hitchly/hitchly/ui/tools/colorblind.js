import { h, field, select } from "../dom.js";
import { loadBitmap, canvasFor } from "../imgio.js";
import { TYPES, simulateImageData } from "../lib/colorblind.js";

export default {
  id: "colour-blindness", title: "Colour-blindness simulator", group: "Images", needsAuth: false,
  keywords: "colorblind color blind accessibility protanopia deuteranopia tritanopia a11y vision",
  blurb: "See an image or screenshot the way people with the common colour-vision deficiencies see it. An approximation (Machado 2009), not a medical test. Runs in your browser.",
  mount(root) {
    const file = h("input", { type: "file", accept: "image/*" });
    const type = select(Object.entries(TYPES).map(([value, t]) => ({ value, label: t.label })));
    const err = h("div", { class: "err", role: "alert" });
    const before = h("canvas", { "aria-label": "Original image" }), after = h("canvas", { "aria-label": "Simulated image" });
    before.className = after.className = "preview"; before.hidden = after.hidden = true;
    let bmp = null;
    function render() {
      if (!bmp) return;
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), hh = Math.max(1, Math.round(bmp.height * k));
      const c = canvasFor(w, hh), g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(bmp, 0, 0, w, hh);
      before.width = w; before.height = hh; before.getContext("2d").drawImage(c, 0, 0);
      const data = g.getImageData(0, 0, w, hh);
      simulateImageData(data.data, type.value);
      after.width = w; after.height = hh; after.getContext("2d").putImageData(data, 0, 0);
      before.hidden = after.hidden = false;
    }
    file.addEventListener("change", async () => {
      err.textContent = ""; const f = file.files[0]; if (!f) return;
      try { bmp = await loadBitmap(f); render(); } catch (e) { err.textContent = e.message; }
    });
    type.addEventListener("change", render);
    root.append(h("div", { class: "card" }, field("Image or screenshot", file), field("Vision type", type), err,
      h("div", { class: "pair" }, h("figure", {}, before, h("figcaption", {}, "Original")), h("figure", {}, after, h("figcaption", {}, "Simulated")))));
  },
};
