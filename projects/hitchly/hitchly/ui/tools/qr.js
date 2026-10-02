import { h, field, input, textarea, select, download, copyText } from "../dom.js";
import { encode, toSvg, toPngDataUrl } from "../lib/qr.js";
import * as payload from "../lib/qrpayload.js";

const TYPES = {
  text: { label: "Text or URL", fields: [["text", "Text or URL", "textarea"]], build: v => (/^https?:\/\//i.test(v.text.trim()) ? payload.url(v.text) : (v.text || (() => { throw new Error("Enter some text or a URL"); })())) },
  wifi: { label: "Wi-Fi network", fields: [["ssid", "Network name (SSID)"], ["password", "Password", "password"], ["security", "Security", ["WPA", "WEP", "nopass"]], ["hidden", "Hidden network", "checkbox"]], build: payload.wifi },
  contact: { label: "Contact card (vCard)", fields: [["first", "First name"], ["last", "Last name"], ["org", "Organisation"], ["title", "Job title"], ["phone", "Phone"], ["email", "Email"], ["url", "Website"]], build: payload.vcard },
  email: { label: "Email", fields: [["to", "To"], ["subject", "Subject"], ["body", "Message", "textarea"]], build: payload.email },
  sms: { label: "SMS", fields: [["number", "Phone number"], ["message", "Message", "textarea"]], build: payload.sms },
  phone: { label: "Phone call", fields: [["number", "Phone number"]], build: v => payload.phone(v.number) },
  geo: { label: "Location", fields: [["lat", "Latitude"], ["lon", "Longitude"]], build: payload.geo },
};

export default {
  id: "qr", title: "QR code generator", group: "QR & URLs", keywords: "qr wifi vcard barcode scan",
  blurb: "Make QR codes for links, Wi-Fi, contacts, email, SMS and locations. Generated in your browser: Wi-Fi passwords and contact details never leave this page.",
  mount(root) {
    const type = select(Object.entries(TYPES).map(([value, t]) => ({ value, label: t.label })));
    const formBox = h("div", { class: "grid" });
    const size = select([{ value: "4", label: "Small" }, { value: "8", label: "Medium" }, { value: "12", label: "Large" }]); size.value = "8";
    const preview = h("div", { class: "card", hidden: true });
    const err = h("div", { class: "err", role: "alert" });
    let controls = {}, svg = "", matrix = null, text = "", touched = false;  // no red errors until the user has typed something

    const render = () => {
      err.textContent = "";
      try {
        const t = TYPES[type.value];
        const values = Object.fromEntries(Object.entries(controls).map(([k, c]) => [k, c.type === "checkbox" ? c.checked : c.value]));
        text = t.build(values);
        matrix = encode(text);
        svg = toSvg(matrix, { scale: Number(size.value) });
        const img = h("img", { alt: "QR code", width: Math.min(320, (matrix.length + 8) * Number(size.value)) });
        img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
        preview.hidden = false;
        const bytes = new TextEncoder().encode(text).length;
        preview.replaceChildren(img,
          h("div", { class: "muted" }, `${matrix.length}×${matrix.length} modules · ${bytes} bytes` + (bytes > 300 ? " · dense code: print it large for reliable scanning" : "")),
          h("div", { class: "actions" },
            h("button", { onclick: () => download("qr.svg", svg, "image/svg+xml") }, "Download SVG"),
            h("button", { class: "ghost", onclick: () => { const a = h("a", { href: toPngDataUrl(matrix, { scale: Number(size.value) }), download: "qr.png" }); document.body.append(a); a.click(); a.remove(); } }, "Download PNG"),
            h("button", { class: "ghost", onclick: () => copyText(text) }, "Copy encoded text")));
      } catch (e) { preview.hidden = true; err.textContent = touched ? e.message : ""; }
    };

    const build = () => {
      formBox.replaceChildren(); controls = {}; touched = false;
      for (const [key, label, kind] of TYPES[type.value].fields) {
        let c;
        if (kind === "textarea") c = textarea();
        else if (kind === "checkbox") c = h("input", { type: "checkbox" });
        else if (Array.isArray(kind)) c = select(kind);
        else c = input({ type: kind || "text", autocomplete: kind === "password" ? "off" : "off" });
        c.addEventListener("input", () => { touched = true; render(); }); controls[key] = c;
        formBox.append(kind === "checkbox" ? h("label", { class: "full" }, c, " " + label) : field(label, c, kind === "textarea" ? "full" : ""));
      }
      render();
    };
    type.addEventListener("input", build); size.addEventListener("input", render);
    root.append(h("div", { class: "card" }, h("div", { class: "grid" }, field("What is it for?", type), field("Size", size)), formBox, err), preview);
    build();
  },
};
