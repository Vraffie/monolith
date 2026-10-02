import { h, field, textarea, output } from "../dom.js";
import { decodeJwt } from "../lib/jwt.js";

export default {
  id: "jwt", title: "JWT decoder", group: "Encode & decode", keywords: "json web token bearer claims",
  blurb: "Read a token's header and claims. It decodes only: the signature is NOT verified, so never treat the result as proof of who sent it. Runs entirely in your browser.",
  mount(root) {
    const src = textarea({ placeholder: "eyJhbGciOi…" });
    const head = output(), body = output(), meta = h("div", { class: "card", hidden: true });
    const err = h("div", { class: "err", role: "alert" });
    const run = () => {
      err.textContent = ""; meta.hidden = true;
      if (!src.value.trim()) { head.set(""); body.set(""); return; }
      try {
        const t = decodeJwt(src.value);
        head.set(JSON.stringify(t.header, null, 2)); body.set(JSON.stringify(t.payload, null, 2));
        meta.replaceChildren(
          h("div", {}, h("span", { class: "pill " + (t.status === "expired" || t.status === "not valid yet" ? "bad" : "good") }, t.status),
            " ", h("span", { class: "pill" }, "signature not verified")),
          ...Object.entries(t.claims).map(([k, v]) => h("div", { class: "muted" }, `${k}: ${v.iso}`)),
          ...t.warnings.map(w => h("div", { class: "err" }, "⚠ " + w)));
        meta.hidden = false;
      } catch (e) { head.set(""); body.set(""); err.textContent = e.message; }
    };
    src.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("Token", src), err), meta,
      h("div", { class: "card" }, h("label", {}, "Header"), head), h("div", { class: "card" }, h("label", {}, "Payload"), body));
  },
};
