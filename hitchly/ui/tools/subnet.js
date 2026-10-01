import { h, field, input, select } from "../dom.js";
import { cidr, rangeToCidrs } from "../lib/subnet.js";

const group = n => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export default {
  id: "subnet", title: "Subnet calculator", group: "Network & web", keywords: "cidr ip address ipv4 ipv6 netmask range network broadcast",
  blurb: "Work out the network, broadcast, host range and mask for an IPv4 or IPv6 CIDR block, or turn an address range into the smallest list of CIDR blocks.",
  mount(root) {
    const mode = select([{ value: "cidr", label: "CIDR calculator" }, { value: "range", label: "Range → CIDR blocks" }]);
    const one = input({ value: "192.168.1.130/26", "aria-label": "Address with prefix" }), start = input({ value: "192.168.0.5" }), end = input({ value: "192.168.0.20" });
    const out = h("div", { class: "card scroll" }), err = h("div", { class: "err", role: "alert" });
    const row = (k, v) => h("tr", {}, h("th", {}, k), h("td", { class: "mono" }, String(v)));
    const cidrBox = h("div", { class: "grid" }, field("Address / prefix (IPv4 or IPv6)", one, "full")), rangeBox = h("div", { class: "grid", hidden: true }, field("First address", start), field("Last address", end));
    const run = () => {
      err.textContent = ""; out.replaceChildren(); cidrBox.hidden = mode.value !== "cidr"; rangeBox.hidden = mode.value !== "range";
      try {
        if (mode.value === "range") {
          const list = rangeToCidrs(start.value, end.value);
          out.append(h("p", {}, `${list.length} block${list.length === 1 ? "" : "s"}:`), h("pre", {}, list.join("\n")));
          return;
        }
        const c = cidr(one.value), v4 = c.version === 4;
        out.append(h("table", {}, row("Network", `${c.network}/${c.prefix}`), row("Mask", c.mask), v4 ? row("Wildcard", c.wildcard) : null, v4 ? row("Broadcast", c.broadcast) : null,
          row(v4 ? "First usable host" : "First address", c.first), row(v4 ? "Last usable host" : "Last address", c.last),
          row(v4 ? "Usable hosts" : "Addresses", group(v4 ? c.usable : c.total)), v4 ? row("Total addresses", group(c.total)) : row("Expanded", c.expanded),
          v4 ? row("Mask (binary)", c.binaryMask) : null, v4 ? row("Class", c.class) : null, v4 ? row("Private (RFC 1918)", c.private ? "yes" : "no") : null));
      } catch (e) { err.textContent = e.message; }
    };
    for (const el of [mode, one, start, end]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("What do you need?", mode), cidrBox, rangeBox, err), out);
    run();
  },
};
