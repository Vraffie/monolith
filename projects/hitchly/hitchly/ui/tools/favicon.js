import { h, field, select, downloadBlob } from "../dom.js";
import { loadBitmap, canvasFor, toBlob } from "../imgio.js";
import { buildIco } from "../lib/ico.js";
import { zip } from "../lib/zip.js";

const SIZES = [16, 32, 48, 180, 192, 512];
const NAMES = { 16: "favicon-16.png", 32: "favicon-32.png", 48: "favicon-48.png", 180: "apple-touch-icon.png", 192: "icon-192.png", 512: "icon-512.png" };
const HTML = `<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`;

export default {
  id: "favicon", title: "Favicon & app icon generator", group: "Images", needsAuth: false,
  keywords: "favicon ico apple touch icon pwa manifest 192 512 app icon png",
  blurb: "Turn one image into favicon.ico, Apple touch icon and PWA icons, plus the HTML and manifest to use them, in a single ZIP. Built in your browser.",
  mount(root) {
    const file = h("input", { type: "file", accept: "image/*" });
    const fit = select([{ value: "contain", label: "Fit whole image (padding)" }, { value: "cover", label: "Fill square (crop edges)" }]);
    const bg = h("input", { type: "color", value: "#ffffff", "aria-label": "Background colour" }), useBg = h("input", { type: "checkbox" });
    const err = h("div", { class: "err", role: "alert" }), strip = h("div", { class: "inline" });
    const save = h("button", { type: "button", class: "primary", disabled: true }, "Download ZIP");
    let files = null;

    async function build() {
      err.textContent = ""; strip.replaceChildren(); save.disabled = true; files = null;
      const f = file.files[0]; if (!f) return;
      try {
        const bmp = await loadBitmap(f), pngs = {};
        for (const s of SIZES) {
          const c = canvasFor(s, s), g = c.getContext("2d");
          if (useBg.checked) { g.fillStyle = bg.value; g.fillRect(0, 0, s, s); }
          const k = (fit.value === "cover" ? Math.max : Math.min)(s / bmp.width, s / bmp.height), w = bmp.width * k, hh = bmp.height * k;
          g.imageSmoothingQuality = "high"; g.drawImage(bmp, (s - w) / 2, (s - hh) / 2, w, hh);
          pngs[s] = new Uint8Array(await (await toBlob(c, "image/png")).arrayBuffer());
        }
        const out = [{ name: "favicon.ico", data: buildIco([16, 32, 48].map(s => ({ width: s, height: s, png: pngs[s] }))) }];
        for (const s of SIZES) out.push({ name: NAMES[s], data: pngs[s] });
        const manifest = { name: "", short_name: "", icons: [192, 512].map(s => ({ src: `/${NAMES[s]}`, sizes: `${s}x${s}`, type: "image/png" })), display: "standalone" };
        out.push({ name: "site.webmanifest", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n") });
        out.push({ name: "head.html", data: new TextEncoder().encode(HTML + "\n") });
        files = out;
        for (const s of SIZES) strip.append(h("img", { src: URL.createObjectURL(new Blob([pngs[s]], { type: "image/png" })), width: Math.min(s, 96), height: Math.min(s, 96), alt: `${s}×${s} icon`, class: "preview" }));
        save.disabled = false;
      } catch (e) { err.textContent = e.message; }
    }
    for (const el of [file, fit, bg, useBg]) el.addEventListener(el === bg ? "input" : "change", build);
    save.addEventListener("click", () => files && downloadBlob("favicons.zip", zip(files), "application/zip"));
    root.append(h("div", { class: "card" }, field("Source image (a square one works best)", file),
      h("div", { class: "grid" }, field("Scaling", fit), h("div", {}, h("label", { class: "inline" }, useBg, "Fill the background"), bg)),
      err, strip, h("p", { class: "muted" }, "ZIP contains: favicon.ico (16, 32, 48), PNGs for 16, 32, 48, 180, 192 and 512 px, site.webmanifest (add your name) and head.html."),
      h("div", { class: "inline" }, save)));
  },
};
