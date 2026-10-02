import { h, field, select, output, download } from "../dom.js";
import { generateKeyPair, KINDS } from "../lib/keys.js";

export default {
  id: "keys", title: "RSA / ECDSA / Ed25519 key pairs", group: "Generate", keywords: "pem public private key ssh rsa ecdsa ed25519 fingerprint pkcs8 spki",
  blurb: "Generate a key pair in your browser and download it as PEM (PKCS#8 private, SPKI public). Handy for tests and demos; for production keys prefer your own trusted tooling and never paste a private key into a site you don't control.",
  mount(root) {
    const kind = select(Object.entries(KINDS).map(([value, k]) => ({ value, label: k.label }))); kind.value = "ecdsa-p256";
    const go = h("button", {}, "Generate"), err = h("div", { class: "err", role: "alert" }), status = h("div", { class: "muted" });
    const pub = output(), priv = output(), fp = output(), results = h("div", { hidden: true });
    go.addEventListener("click", async () => {
      err.textContent = ""; go.disabled = true; status.textContent = "Generating… (RSA 4096 can take several seconds)";
      try {
        const k = await generateKeyPair(kind.value);
        pub.set(k.publicPem); priv.set(k.privatePem); fp.set(k.fingerprint); results.hidden = false; status.textContent = "";
      } catch (e) { err.textContent = e.message; status.textContent = ""; } finally { go.disabled = false; }
    });
    const save = (name, o) => h("button", { class: "ghost small", onclick: () => download(`${kind.value}-${name}.pem`, o.get(), "application/x-pem-file") }, "Download");
    root.append(h("div", { class: "card" }, h("div", { class: "inline" }, field("Key type", kind), go), status, err), results);
    results.append(h("div", { class: "card" }, h("label", {}, "Public key (share this)"), pub, save("public", pub)), h("div", { class: "card" }, h("label", {}, "Private key (keep this secret)"), priv, save("private", priv)),
      h("div", { class: "card" }, h("label", {}, "SHA-256 fingerprint of the public key"), fp));
  },
};
