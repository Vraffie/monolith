import { h, field, input, select, output } from "../dom.js";
import { basicAuthHeader, parseBasicAuth } from "../lib/validators.js";

export default {
  id: "basicauth", title: "Basic auth header", group: "Network & web", keywords: "authorization http basic username password base64 curl",
  blurb: "Build an HTTP Basic Authorization header from a user name and password, or decode one. Basic auth is Base64, not encryption: only use it over HTTPS.",
  mount(root) {
    const mode = select([{ value: "build", label: "Build a header" }, { value: "parse", label: "Decode a header" }]);
    const user = input({ value: "Aladdin" }), pass = input({ value: "open sesame" }), header = input({ placeholder: "Authorization: Basic …" });
    const buildBox = h("div", { class: "grid" }, field("User name", user), field("Password", pass)), parseBox = h("div", { hidden: true }, field("Header", header));
    const out = output(), err = h("div", { class: "err", role: "alert" });
    const run = () => {
      err.textContent = ""; buildBox.hidden = mode.value !== "build"; parseBox.hidden = mode.value !== "parse";
      try {
        if (mode.value === "build") { const hd = basicAuthHeader(user.value, pass.value); out.set(`${hd}\n\ncurl -u '${user.value}:${pass.value}' https://example.com/api`); }
        else if (header.value.trim()) { const r = parseBasicAuth(header.value); out.set(`user: ${r.user}\npassword: ${r.password}`); } else out.set("");
      } catch (e) { out.set(""); err.textContent = e.message; }
    };
    for (const el of [mode, user, pass, header]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("Mode", mode), buildBox, parseBox, err), h("div", { class: "card" }, out));
    run();
  },
};
