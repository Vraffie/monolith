import { h, field, textarea, output, select } from "../dom.js";
import { encode, decode } from "../lib/urlcodec.js";

export default {
  id: "url-encode", title: "URL encode / decode", group: "Encode & decode", keywords: "percent encoding uri query string",
  blurb: "Percent-encode or decode text for use in URLs and query strings.",
  mount(root) {
    const src = textarea({ placeholder: "Text or %-encoded text…" });
    const mode = select([{ value: "enc", label: "Encode" }, { value: "dec", label: "Decode" }]);
    const scope = select([{ value: "component", label: "Component (encode everything reserved)" }, { value: "full", label: "Whole URL (keep : / ? # & =)" }]);
    const form = h("input", { type: "checkbox" });
    const out = output();
    const err = h("div", { class: "err", role: "alert" });
    const run = () => {
      err.textContent = "";
      try { out.set(mode.value === "enc" ? encode(src.value, { form: form.checked, full: scope.value === "full" }) : decode(src.value, { form: form.checked })); }
      catch (e) { out.set(""); err.textContent = e.message; }
    };
    for (const el of [src, mode, scope, form]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("Input", src), h("div", { class: "inline" }, field("Mode", mode), field("Scope", scope),
      h("label", {}, form, "Form style (space ↔ +)")), err), h("div", { class: "card" }, h("label", {}, "Output"), out));
  },
};
