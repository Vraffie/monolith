import { h, field, input, select, output } from "../dom.js";
import { uuidv4, uuidv7, inspect } from "../lib/uuid.js";

export default {
  id: "uuid", title: "UUID generator", group: "Generate", keywords: "guid v4 v7 identifier random",
  blurb: "Generate random v4 UUIDs or time-ordered v7 UUIDs (good database keys), and inspect an existing one.",
  mount(root) {
    const version = select([{ value: "4", label: "v4 (random)" }, { value: "7", label: "v7 (time-ordered)" }]);
    const count = input({ type: "number", value: "5", min: "1", max: "100" });
    const out = output();
    const make = () => {
      const n = Math.min(100, Math.max(1, Number(count.value) || 1));
      out.set(Array.from({ length: n }, () => (version.value === "7" ? uuidv7() : uuidv4())).join("\n"));
    };
    const probe = input({ placeholder: "Paste a UUID to inspect" });
    const info = h("div", { class: "muted" });
    probe.addEventListener("input", () => {
      const r = inspect(probe.value);
      info.textContent = !probe.value.trim() ? "" : r ? `Valid UUID, version ${r.version}` + (r.timestamp ? `, created ${r.timestamp}` : "") : "Not a valid UUID";
    });
    root.append(h("div", { class: "card" }, h("div", { class: "inline" }, field("Version", version), field("How many", count),
      h("button", { onclick: make }, "Generate"))), h("div", { class: "card" }, out),
      h("div", { class: "card" }, field("Inspect", probe), info));
    make();
  },
};
