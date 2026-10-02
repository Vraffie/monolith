import { h, field, select, input, downloadBlob } from "../dom.js";
import { loadBitmap, canvasFor, toBlob, humanSize } from "../imgio.js";

const TYPES = [{ value: "image/png", label: "PNG (lossless)" }, { value: "image/jpeg", label: "JPEG" }, { value: "image/webp", label: "WebP" }];
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export default {
  id: "image-convert", title: "Image converter & compressor", group: "Images", needsAuth: false,
  keywords: "resize compress shrink convert png jpeg jpg webp scale reduce size photo",
  blurb: "Convert between PNG, JPEG and WebP, resize and compress. Runs in your browser; the image is never uploaded. Re-encoding drops metadata as a side effect.",
  mount(root) {
    const file = h("input", { type: "file", accept: "image/*" });
    const fmt = select(TYPES), quality = h("input", { type: "range", min: "10", max: "100", value: "80" }), qv = h("span", {}, "80");
    const width = input({ inputmode: "numeric", "aria-label": "Width in pixels" }), height = input({ inputmode: "numeric", "aria-label": "Height in pixels" });
    const lock = h("input", { type: "checkbox", checked: true }), bg = h("input", { type: "color", value: "#ffffff", "aria-label": "Background for transparent areas" });
    const err = h("div", { class: "err", role: "alert" }), info = h("p", { "aria-live": "polite" }), preview = h("img", { class: "preview", alt: "Result preview", hidden: true });
    const save = h("button", { type: "button", class: "primary", disabled: true }, "Download");
    let bmp = null, result = null, orig = null, ratio = 1, seq = 0;

    async function render() {
      if (!bmp) return;
      const my = ++seq; err.textContent = "";
      try {
        const w = Math.round(+width.value), hh = Math.round(+height.value);
        if (!(w >= 1 && hh >= 1 && w <= 16384 && hh <= 16384 && w * hh <= 100e6)) throw new Error("Width and height must be whole numbers from 1 to 16384");
        const c = canvasFor(w, hh), g = c.getContext("2d");
        if (fmt.value === "image/jpeg") { g.fillStyle = bg.value; g.fillRect(0, 0, w, hh); }   // JPEG has no transparency
        g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0, w, hh);
        const blob = await toBlob(c, fmt.value, +quality.value / 100);
        if (my !== seq) return;
        if (blob.type !== fmt.value) throw new Error(`This browser cannot encode ${fmt.value}; it produced ${blob.type || "something else"}`);
        result = blob; URL.revokeObjectURL(preview.src); preview.src = URL.createObjectURL(blob); preview.hidden = false; save.disabled = false;
        const d = ((blob.size - orig.size) / orig.size) * 100;
        info.textContent = `${bmp.width}×${bmp.height} ${orig.size ? humanSize(orig.size) : ""} → ${w}×${hh} ${humanSize(blob.size)} (${d <= 0 ? "" : "+"}${d.toFixed(0)}%)`;
      } catch (e) { if (my === seq) { err.textContent = e.message; save.disabled = true; } }
    }
    let t; const later = () => { clearTimeout(t); t = setTimeout(render, 200); };
    file.addEventListener("change", async () => {
      err.textContent = ""; const f = file.files[0]; if (!f) return;
      try { bmp = await loadBitmap(f); } catch (e) { err.textContent = e.message; return; }
      orig = f; ratio = bmp.width / bmp.height; width.value = bmp.width; height.value = bmp.height; render();
    });
    width.addEventListener("input", () => { if (lock.checked && +width.value > 0) height.value = Math.max(1, Math.round(+width.value / ratio)); later(); });
    height.addEventListener("input", () => { if (lock.checked && +height.value > 0) width.value = Math.max(1, Math.round(+height.value * ratio)); later(); });
    quality.addEventListener("input", () => { qv.textContent = quality.value; later(); });
    fmt.addEventListener("change", render); bg.addEventListener("input", later);
    save.addEventListener("click", () => result && downloadBlob(`${(orig.name || "image").replace(/\.[^.]+$/, "")}.${EXT[fmt.value]}`, result));
    root.append(h("div", { class: "card" }, field("Image", file),
      h("div", { class: "grid3" }, field("Format", fmt), field(["Quality (JPEG/WebP): ", qv], quality), field("Background (JPEG)", bg)),
      h("div", { class: "grid" }, field("Width (px)", width), field("Height (px)", height)),
      h("label", { class: "inline" }, lock, "Keep proportions"), err, info, preview, h("div", { class: "inline" }, save)));
  },
};
