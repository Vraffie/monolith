import { h, field, textarea, input, output, downloadBlob } from "../dom.js";
import { fileBytes, humanSize } from "../imgio.js";
import { toDataUri, parseDataUri, EXTENSIONS } from "../lib/datauri.js";

export default {
  id: "data-uri", title: "File ⇄ data: URI", group: "Images", needsAuth: false,
  keywords: "data uri base64 embed inline image css html convert decode",
  blurb: "Turn a small file into a data: URI to inline in HTML or CSS, or paste a data: URI to preview and download it. Base64 adds about a third to the size.",
  mount(root) {
    const file = h("input", { type: "file" }), out = output(), info = h("p", { class: "muted", "aria-live": "polite" }), err = h("div", { class: "err", role: "alert" });
    const src = textarea({ rows: "5", placeholder: "data:image/png;base64,…", "aria-label": "data: URI to decode" }), prev = h("img", { class: "preview", alt: "Decoded image", hidden: true });
    const save = h("button", { type: "button", disabled: true }, "Download decoded file"), decErr = h("div", { class: "err", role: "alert" }), decInfo = h("p", { class: "muted" });
    let decoded = null;
    file.addEventListener("change", async () => {
      err.textContent = ""; const f = file.files[0]; if (!f) return;
      try {
        if (f.size > 5 * 1048576) throw new Error("Files over 5 MB make impractical data URIs; use a regular file instead");
        const uri = toDataUri(await fileBytes(f), f.type || "application/octet-stream");
        out.set(uri); info.textContent = `${humanSize(f.size)} → ${humanSize(uri.length)} as text. CSS: url("…")  HTML: <img src="…">`;
      } catch (e) { err.textContent = e.message; }
    });
    const decode = () => {
      decErr.textContent = ""; decoded = null; save.disabled = true; prev.hidden = true; decInfo.textContent = "";
      if (!src.value.trim()) return;
      try {
        const r = parseDataUri(src.value); decoded = r; save.disabled = false; decInfo.textContent = `${r.mime}, ${humanSize(r.bytes.length)}`;
        if (/^image\/(png|jpeg|gif|webp)$/.test(r.mime)) { URL.revokeObjectURL(prev.src); prev.src = URL.createObjectURL(new Blob([r.bytes], { type: r.mime })); prev.hidden = false; }
      } catch (e) { decErr.textContent = e.message; }
    };
    src.addEventListener("input", decode);
    save.addEventListener("click", () => decoded && downloadBlob(`data.${EXTENSIONS[decoded.mime] || "bin"}`, decoded.bytes, decoded.mime));
    root.append(h("div", { class: "card" }, h("h2", {}, "File → data: URI"), field("File", file), err, out, info),
      h("div", { class: "card" }, h("h2", {}, "data: URI → file"), field("data: URI", src), decErr, decInfo, prev, h("div", { class: "inline" }, save)));
  },
};
