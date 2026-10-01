import { h, field, input, output } from "../dom.js";
import { fromOctal, toOctal, toSymbolic, fromSymbolic, describe } from "../lib/chmod.js";

const WHO = [["owner", "Owner"], ["group", "Group"], ["other", "Others"]], BITS = [["r", "Read"], ["w", "Write"], ["x", "Execute"]];

export default {
  id: "chmod", title: "chmod calculator", group: "Format & convert", keywords: "unix file permissions octal 755 644 rwx setuid sticky",
  blurb: "Tick permissions or type the octal (755) or symbolic (rwxr-xr-x) form; all three stay in sync.",
  mount(root) {
    let perms = fromOctal("644");
    const octal = input({ value: "644", maxlength: "4", "aria-label": "Octal mode" }), sym = input({ value: "rw-r--r--", maxlength: "10", "aria-label": "Symbolic mode" });
    const boxes = {}, err = h("div", { class: "err", role: "alert" }), desc = h("p"), cmd = output();
    const special = [["setuid", "setuid"], ["setgid", "setgid"], ["sticky", "sticky"]].map(([k, label]) => { const b = h("input", { type: "checkbox" }); boxes[k] = b; return h("label", {}, b, label); });
    const grid = h("div", { class: "grid3 checks" }, WHO.map(([w, label]) => h("div", {}, h("strong", {}, label), BITS.map(([bit, bl]) => { const b = h("input", { type: "checkbox" }); boxes[w + bit] = b; return h("label", {}, b, bl); }))));
    const paint = except => {
      for (const [w] of WHO) for (const [bit] of BITS) boxes[w + bit].checked = perms[w][bit];
      for (const k of ["setuid", "setgid", "sticky"]) boxes[k].checked = perms[k];
      if (except !== "octal") octal.value = toOctal(perms); if (except !== "sym") sym.value = toSymbolic(perms);
      desc.textContent = describe(perms); cmd.set(`chmod ${toOctal(perms).padStart(3, "0")} file`); err.textContent = "";
    };
    const fromBoxes = () => { for (const [w] of WHO) for (const [bit] of BITS) perms[w][bit] = boxes[w + bit].checked; for (const k of ["setuid", "setgid", "sticky"]) perms[k] = boxes[k].checked; paint(); };
    for (const b of Object.values(boxes)) b.addEventListener("input", fromBoxes);
    octal.addEventListener("input", () => { try { perms = fromOctal(octal.value); paint("octal"); } catch (e) { err.textContent = e.message; } });
    sym.addEventListener("input", () => { try { perms = fromSymbolic(sym.value); paint("sym"); } catch (e) { err.textContent = e.message; } });
    root.append(h("div", { class: "card" }, grid, h("div", { class: "inline checks" }, special), h("div", { class: "grid" }, field("Octal", octal), field("Symbolic", sym)), err), h("div", { class: "card" }, desc, cmd));
    paint();
  },
};
