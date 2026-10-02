import { h, field, downloadBlob } from "../dom.js";
import { fileBytes, humanSize } from "../imgio.js";
import { inspect, strip } from "../lib/imgmeta.js";

export default {
  id: "image-privacy", title: "Photo privacy cleaner", group: "Images", needsAuth: false,
  keywords: "exif gps location metadata remove strip photo privacy jpeg png webp",
  blurb: "See what a photo gives away (camera, date, GPS location) and remove it without re-encoding: the picture itself stays byte-for-byte identical. Nothing is uploaded.",
  mount(root) {
    const file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp" });
    const icc = h("input", { type: "checkbox", checked: true });
    const err = h("div", { class: "err", role: "alert" }), report = h("div", { "aria-live": "polite" });
    const save = h("button", { type: "button", class: "primary", disabled: true }, "Download cleaned copy");
    let current = null;

    const row = (k, v) => h("tr", {}, h("th", { scope: "row" }, k), h("td", {}, v));
    async function run() {
      err.textContent = ""; report.replaceChildren(); save.disabled = true; current = null;
      const f = file.files[0];
      if (!f) return;
      try {
        const bytes = await fileBytes(f), info = inspect(bytes), res = info.format === "gif" ? null : strip(bytes, { keepIcc: icc.checked });
        const facts = [];
        const e = info.exif;
        if (e) {
          if (e.make || e.model) facts.push(row("Camera", [e.make, e.model].filter(Boolean).join(" ")));
          if (e.software) facts.push(row("Software", e.software));
          if (e.artist) facts.push(row("Artist", e.artist));
          if (e.copyright) facts.push(row("Copyright", e.copyright));
          if (e.dateTime) facts.push(row("Taken", e.dateTime));
          if (e.gps) facts.push(row("GPS location", `${e.gps.lat.toFixed(5)}, ${e.gps.lon.toFixed(5)}`));
          if (e.orientation && e.orientation !== 1) facts.push(row("Orientation", `${e.orientation} (stored rotated; cleaning keeps the file readable but some viewers will then show it sideways)`));
        }
        report.append(
          h("p", {}, `${f.name}: ${info.format.toUpperCase()}${info.width ? `, ${info.width}×${info.height}` : ""}, ${humanSize(bytes.length)}`),
          info.note ? h("p", { class: "muted" }, info.note) : null,
          facts.length ? h("div", {}, h("h2", {}, "Personal details found"), h("table", { class: "kv" }, h("tbody", {}, facts))) : h("p", {}, "No camera, date or location details found."),
          info.items.length ? h("div", {}, h("h2", {}, "Will be removed"), h("ul", {}, info.items.map(i => h("li", {}, `${i.label}: ${humanSize(i.bytes)}`)))) : h("p", {}, "Nothing to remove."),
          res ? h("p", {}, `Cleaned copy: ${humanSize(res.bytes.length)} (saves ${humanSize(res.saved)}).`) : null);
        if (res) {
          current = { res, name: f.name.replace(/(\.[^.]+)?$/, m => `-clean${m || ""}`), type: f.type || `image/${info.format}` };
          save.disabled = false;
        }
      } catch (x) { err.textContent = x.message; }
    }
    file.addEventListener("change", run); icc.addEventListener("change", run);
    save.addEventListener("click", () => current && downloadBlob(current.name, current.res.bytes, current.type));
    root.append(h("div", { class: "card" },
      field("Photo (JPEG, PNG or WebP)", file),
      h("label", { class: "inline" }, icc, "Keep the colour profile (recommended: removing it can change how colours look)"),
      err, report, h("div", { class: "inline" }, save)));
  },
};
