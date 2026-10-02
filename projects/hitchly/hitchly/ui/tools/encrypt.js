import { h, field, textarea, input, select, output } from "../dom.js";
import { encryptText, decryptText } from "../lib/encrypt.js";

export default {
  id: "encrypt", title: "Encrypt & decrypt text", group: "Encode & decode", keywords: "aes gcm pbkdf2 passphrase password secret encrypt decrypt",
  blurb: "Encrypt a message with a passphrase (PBKDF2-SHA256 → AES-256-GCM) and get a text token you can paste anywhere; decrypt it again with the same passphrase. A weak passphrase is still weak, and this is for short notes, not a substitute for dedicated file-encryption software.",
  mount(root) {
    const mode = select([{ value: "enc", label: "Encrypt" }, { value: "dec", label: "Decrypt" }]), src = textarea({ placeholder: "Text to encrypt, or an hx1.… token to decrypt" });
    const pw = input({ type: "password", autocomplete: "off", "aria-label": "Passphrase" }), iters = select([{ value: "100000", label: "100,000 (fast)" }, { value: "600000", label: "600,000 (recommended)" }, { value: "1500000", label: "1,500,000 (slow, stronger)" }]); iters.value = "600000";
    const go = h("button", {}, "Run"), out = output(), err = h("div", { class: "err", role: "alert" }), itLabel = field("PBKDF2 iterations", iters);
    mode.addEventListener("input", () => { itLabel.hidden = mode.value === "dec"; out.set(""); err.textContent = ""; });
    go.addEventListener("click", async () => {
      err.textContent = ""; out.set(""); go.disabled = true; go.textContent = "Working…";
      try { out.set(mode.value === "enc" ? await encryptText(src.value, pw.value, { iterations: Number(iters.value) }) : await decryptText(src.value, pw.value)); }
      catch (e) { err.textContent = e.message; } finally { go.disabled = false; go.textContent = "Run"; }
    });
    root.append(h("div", { class: "card" }, field("Input", src), h("div", { class: "grid" }, field("Mode", mode), field("Passphrase", pw), itLabel), h("div", { class: "actions" }, go), err), h("div", { class: "card" }, h("label", {}, "Output"), out),
      h("p", { class: "muted" }, "Format: hx1.<iterations>.<salt>.<iv>.<ciphertext>. Decryption fails if the passphrase is wrong or any byte was changed."));
  },
};
