import { h, field, input, output } from "../dom.js";
import { generate, randomToken, strengthLabel, SETS } from "../lib/password.js";

export default {
  id: "password", title: "Password & token generator", group: "Generate", keywords: "random secret api key strong",
  blurb: "Cryptographically random passwords and tokens, generated in your browser with unbiased sampling. Nothing is sent or stored.",
  mount(root) {
    const length = input({ type: "number", value: "20", min: "4", max: "512" });
    const boxes = Object.keys(SETS).map(k => [k, h("input", { type: "checkbox", checked: true })]);
    const ambiguous = h("input", { type: "checkbox" });
    const out = output(), info = h("div", { class: "muted" }), err = h("div", { class: "err", role: "alert" });
    const make = () => {
      err.textContent = "";
      try {
        const r = generate({ length: Number(length.value), sets: boxes.filter(([, b]) => b.checked).map(([k]) => k), avoidAmbiguous: ambiguous.checked });
        out.set(r.password); info.textContent = `${r.entropyBits} bits of entropy: ${strengthLabel(r.entropyBits)}`;
      } catch (e) { out.set(""); info.textContent = ""; err.textContent = e.message; }
    };
    const bytes = input({ type: "number", value: "32", min: "8", max: "128" });
    const tokOut = output();
    const tok = fmt => () => tokOut.set(randomToken(Math.min(128, Math.max(8, Number(bytes.value) || 32)), fmt));
    root.append(h("div", { class: "card" }, h("div", { class: "inline" }, field("Length", length),
      ...boxes.map(([k, b]) => h("label", {}, b, k)), h("label", {}, ambiguous, "avoid look-alikes (O/0, l/1)"),
      h("button", { onclick: make }, "Generate")), err), h("div", { class: "card" }, out, info),
      h("div", { class: "card" }, h("div", { class: "inline" }, field("Token bytes", bytes),
        h("button", { onclick: tok("hex") }, "Hex token"), h("button", { class: "ghost", onclick: tok("base64url") }, "Base64URL token")), tokOut));
    make();
  },
};
