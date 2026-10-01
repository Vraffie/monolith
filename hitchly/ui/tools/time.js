import { h, field, input } from "../dom.js";
import { parseTime, formats } from "../lib/time.js";
import { output } from "../dom.js";

export default {
  id: "time", title: "Timestamp converter", group: "Format & convert", keywords: "unix epoch date timezone iso",
  blurb: "Convert between Unix time (seconds or milliseconds, auto-detected), ISO dates and time zones.",
  mount(root) {
    const src = input({ placeholder: "now, 1700000000, 1700000000000 or 2026-10-01T12:00:00Z", value: "now" });
    const zone = input({ value: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });
    const table = h("table"), err = h("div", { class: "err", role: "alert" });
    const run = () => {
      err.textContent = ""; table.replaceChildren();
      try {
        const f = formats(parseTime(src.value), zone.value.trim() || "UTC");
        for (const [k, v] of Object.entries(f)) table.append(h("tr", {}, h("th", {}, k), h("td", { class: "mono" }, v)));
      } catch (e) { err.textContent = e.message; }
    };
    src.addEventListener("input", run); zone.addEventListener("input", run);
    root.append(h("div", { class: "card grid" }, field("Time", src, "full"), field("Time zone (IANA name)", zone), h("div", { class: "full" }, err)), h("div", { class: "card" }, table));
    run();
  },
};
