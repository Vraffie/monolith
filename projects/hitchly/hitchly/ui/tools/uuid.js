import { h, field, input, select, output } from "../dom.js";
import { uuidv4, uuidv7, inspect } from "../lib/uuid.js";
import { ulid, decodeUlid } from "../lib/ulid.js";

export default {
  id: "uuid", title: "UUID & ULID generator", group: "Generate", keywords: "guid v4 v7 ulid identifier random sortable",
  blurb: "Generate random v4 UUIDs, time-ordered v7 UUIDs or ULIDs (both sort by creation time, good database keys), and inspect an existing identifier.",
  mount(root) {
    const version = select([{ value: "4", label: "v4 (random)" }, { value: "7", label: "UUID v7 (time-ordered)" }, { value: "ulid", label: "ULID (sortable, 26 characters)" }]);
    const count = input({ type: "number", value: "5", min: "1", max: "100" });
    const out = output();
    const make = () => {
      const n = Math.min(100, Math.max(1, Number(count.value) || 1));
      out.set(Array.from({ length: n }, () => (version.value === "ulid" ? ulid() : version.value === "7" ? uuidv7() : uuidv4())).join("\n"));
    };
    const probe = input({ placeholder: "Paste a UUID or ULID to inspect" });
    const info = h("div", { class: "muted" });
    probe.addEventListener("input", () => {
      const r = inspect(probe.value);
      let u = null; try { u = decodeUlid(probe.value); } catch { /* not a ULID */ }
      info.textContent = !probe.value.trim() ? "" : r ? `Valid UUID, version ${r.version}` + (r.timestamp ? `, created ${r.timestamp}` : "") : u ? `Valid ULID, created ${u.iso}` : "Not a valid UUID or ULID";
    });
    root.append(h("div", { class: "card" }, h("div", { class: "inline" }, field("Version", version), field("How many", count),
      h("button", { onclick: make }, "Generate"))), h("div", { class: "card" }, out),
      h("div", { class: "card" }, field("Inspect", probe), info));
    make();
  },
};
