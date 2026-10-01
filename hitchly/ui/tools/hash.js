import { h, field, textarea, input, output, select } from "../dom.js";
import { ALGORITHMS, digest, hmac, toHex } from "../lib/hash.js";

export default {
  id: "hash", title: "Hash & HMAC", group: "Encode & decode", keywords: "sha256 sha1 sha512 checksum hmac digest file",
  blurb: "SHA-1/256/384/512 of text or a file, plus HMAC. Computed locally with the browser's crypto; nothing is uploaded. (MD5 is not offered: it is broken for security use.)",
  mount(root) {
    const src = textarea({ placeholder: "Text to hash…" });
    const key = input({ placeholder: "HMAC key (optional)" });
    const file = h("input", { type: "file" });
    const out = h("div");
    const err = h("div", { class: "err", role: "alert" });
    async function show(label, getBytes) {
      err.textContent = ""; out.replaceChildren();
      try {
        const data = await getBytes();
        for (const algo of ALGORITHMS) {
          const o = output(await digest(data, algo));
          out.append(h("div", { class: "card" }, h("label", {}, algo), o));
        }
        if (key.value && typeof data === "string") {
          for (const algo of ["SHA-256", "SHA-512"]) out.append(h("div", { class: "card" }, h("label", {}, "HMAC-" + algo), output(await hmac(key.value, data, algo))));
        }
      } catch (e) { err.textContent = e.message; }
    }
    const run = () => show("text", async () => src.value);
    src.addEventListener("input", run); key.addEventListener("input", run);
    file.addEventListener("change", () => file.files[0] && show("file", async () => new Uint8Array(await file.files[0].arrayBuffer())));
    root.append(h("div", { class: "card grid" }, field("Text", src, "full"), field("HMAC key", key), field("…or a file", file), h("div", { class: "full" }, err)), out);
    run();
  },
};
