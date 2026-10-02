import { h, field, textarea, output, select } from "../dom.js";
import { encodeText, decodeText } from "../lib/base64.js";

export default {
  id: "base64", title: "Base64", group: "Encode & decode", keywords: "encode decode binary base64url",
  blurb: "Encode text to Base64 or decode it back. UTF-8 safe; accepts URL-safe input and missing padding.",
  mount(root) {
    const src = textarea({ placeholder: "Text or Base64…" });
    const mode = select([{ value: "enc", label: "Encode" }, { value: "dec", label: "Decode" }]);
    const urlSafe = h("input", { type: "checkbox" });
    const pad = h("input", { type: "checkbox", checked: true });
    const out = output();
    const err = h("div", { class: "err", role: "alert" });
    const run = () => {
      err.textContent = "";
      try { out.set(mode.value === "enc" ? encodeText(src.value, { urlSafe: urlSafe.checked, padding: pad.checked }) : decodeText(src.value)); }
      catch (e) { out.set(""); err.textContent = e.message; }
    };
    for (const el of [src, mode, urlSafe, pad]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("Input", src), h("div", { class: "inline" },
      field("Mode", mode), h("label", {}, urlSafe, "URL-safe alphabet"), h("label", {}, pad, "Padding")), err),
      h("div", { class: "card" }, h("label", {}, "Output"), out));
  },
};
