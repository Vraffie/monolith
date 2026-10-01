import { h, field, input, select, output } from "../dom.js";
import { base32Encode, base32Decode, totp, otpauthUri, ALGORITHMS } from "../lib/totp.js";
import { encode, toSvg } from "../lib/qr.js";

export default {
  id: "totp", title: "TOTP (2FA) codes", group: "Generate", keywords: "otp authenticator google authenticator 2fa two factor rfc 6238 hotp",
  blurb: "Generate the six-digit code an authenticator app would show for a secret, create a new secret with its QR code, and check a code. Everything happens in your browser; still avoid pasting a production secret on a computer you don't trust.",
  mount(root) {
    const secret = input({ placeholder: "Base32 secret, e.g. JBSWY3DPEHPK3PXP", "aria-label": "Secret" }), account = input({ value: "alice@example.com" }), issuer = input({ value: "Example" });
    const algo = select(Object.keys(ALGORITHMS)), digits = select(["6", "7", "8"]), period = input({ type: "number", value: "30", min: "10", max: "120" });
    const code = h("div", { class: "big-code", "aria-live": "off" }, "——"), left = h("div", { class: "muted" }), err = h("div", { class: "err", role: "alert" });
    const uri = output(), qrBox = h("div"), check = input({ placeholder: "Code to check", inputmode: "numeric", "aria-label": "Code to check" }), verdict = h("div", { class: "muted" });
    const opts = () => ({ digits: Number(digits.value), algorithm: algo.value, period: Math.max(10, Number(period.value) || 30) });
    const keyBytes = () => base32Decode(secret.value);
    async function tick() {
      err.textContent = "";
      try {
        const o = opts(), r = await totp(keyBytes(), Date.now() / 1000, o);
        code.textContent = r.code.replace(/^(.{3})(.+)$/, "$1 $2"); left.textContent = `Changes in ${r.secondsLeft} s`;
        const u = otpauthUri({ secret: secret.value, account: account.value || "account", issuer: issuer.value, ...o });
        uri.set(u); qrBox.replaceChildren(h("img", { alt: "QR code for the authenticator app", width: 180, height: 180, src: "data:image/svg+xml;utf8," + encodeURIComponent(toSvg(encode(u), { scale: 4 })) }));
        if (check.value.trim()) {  // accept the previous and next period too, as servers do for clock drift
          const now = Date.now() / 1000, want = check.value.replace(/\s/g, "");
          const hits = [];
          for (const [label, dt] of [["the previous code", -o.period], ["the current code", 0], ["the next code", o.period]]) if ((await totp(keyBytes(), now + dt, o)).code === want) hits.push(label);
          verdict.textContent = hits.length ? "✓ Matches " + hits[0] : "✗ Does not match the current, previous or next code";
        } else verdict.textContent = "";
      } catch (e) { code.textContent = "——"; left.textContent = ""; uri.set(""); qrBox.replaceChildren(); if (secret.value.trim()) err.textContent = e.message; }
    }
    const gen = h("button", { class: "ghost", type: "button", onclick: () => { secret.value = base32Encode(crypto.getRandomValues(new Uint8Array(20))); tick(); } }, "Generate a new secret");
    for (const el of [secret, account, issuer, algo, digits, period, check]) el.addEventListener("input", tick);
    const timer = setInterval(() => { if (!root.isConnected) clearInterval(timer); else tick(); }, 1000);
    root.append(h("div", { class: "card grid" }, field("Secret (Base32)", secret, "full"), field("Account", account), field("Issuer", issuer), field("Algorithm", algo), field("Digits", digits), field("Period (s)", period), h("div", { class: "full actions" }, gen), h("div", { class: "full" }, err)),
      h("div", { class: "card" }, code, left), h("div", { class: "card" }, h("div", { class: "grid" }, h("div", {}, h("label", {}, "Provisioning URI (scan or paste into an authenticator app)"), uri), h("div", {}, qrBox))),
      h("div", { class: "card" }, field("Check a code", check), verdict));
    tick();
  },
};
