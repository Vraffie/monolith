import { h, field, input, select } from "../dom.js";
import { validateIban, normalizeEmail } from "../lib/validators.js";

export default {
  id: "validate", title: "IBAN validator & email normaliser", group: "Format & convert", keywords: "iban bank account checksum email normalize gmail dots plus tag duplicate",
  blurb: "Check an IBAN's country length and checksum, or reduce email addresses to a canonical form for de-duplication. Nothing is looked up or sent anywhere.",
  mount(root) {
    const mode = select([{ value: "iban", label: "IBAN" }, { value: "email", label: "Email" }]), v = input({ value: "GB82 WEST 1234 5698 7654 32", "aria-label": "Value" });
    const lower = h("input", { type: "checkbox", checked: true }), plus = h("input", { type: "checkbox", checked: true }), dots = h("input", { type: "checkbox", checked: true });
    const opts = h("div", { class: "inline", hidden: true }, h("label", {}, lower, "lower-case the name part"), h("label", {}, plus, "remove +tags"), h("label", {}, dots, "remove dots (Gmail only)"));
    const out = h("div", { class: "card" });
    const run = () => {
      out.replaceChildren(); opts.hidden = mode.value !== "email";
      if (!v.value.trim()) return;
      if (mode.value === "iban") {
        const r = validateIban(v.value);
        out.append(h("p", {}, h("span", { class: "pill " + (r.valid ? "good" : "bad") }, r.valid ? "Valid" : "Not valid")), r.valid ? h("p", { class: "mono" }, r.formatted) : h("p", {}, r.reason), r.note ? h("p", { class: "muted" }, r.note) : null,
          h("p", { class: "muted" }, "A valid checksum means the number is well-formed, not that the account exists."));
      } else {
        try { out.append(h("p", { class: "mono" }, normalizeEmail(v.value, { lowerLocal: lower.checked, stripPlus: plus.checked, gmailDots: dots.checked })), h("p", { class: "muted" }, "Two addresses that normalise to the same value probably reach the same mailbox, but providers differ: treat this as a hint, not proof.")); }
        catch (e) { out.append(h("p", { class: "err" }, e.message)); }
      }
    };
    mode.addEventListener("input", () => { v.value = mode.value === "iban" ? "GB82 WEST 1234 5698 7654 32" : "John.Doe+news@Gmail.com"; run(); });
    for (const el of [v, lower, plus, dots]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, h("div", { class: "grid" }, field("Check", mode), field("Value", v)), opts), out);
    run();
  },
};
