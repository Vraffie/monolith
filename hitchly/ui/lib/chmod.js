/** Unix permission bits: octal <-> symbolic <-> checkbox model, including setuid/setgid/sticky. */
const WHO = ["owner", "group", "other"];

export function fromOctal(text) {
  const t = text.trim();
  if (!/^[0-7]{3,4}$/.test(t)) throw new Error("Use 3 or 4 octal digits (each 0-7), e.g. 755 or 4755");
  const d = t.padStart(4, "0").split("").map(Number);
  const out = { setuid: !!(d[0] & 4), setgid: !!(d[0] & 2), sticky: !!(d[0] & 1) };
  WHO.forEach((w, i) => { out[w] = { r: !!(d[i + 1] & 4), w: !!(d[i + 1] & 2), x: !!(d[i + 1] & 1) }; });
  return out;
}

export function toOctal(p) {
  const digit = x => (x.r ? 4 : 0) + (x.w ? 2 : 0) + (x.x ? 1 : 0);
  const special = (p.setuid ? 4 : 0) + (p.setgid ? 2 : 0) + (p.sticky ? 1 : 0);
  return (special ? String(special) : "") + WHO.map(w => digit(p[w])).join("");
}

export function toSymbolic(p) {
  const triple = (x, special, ch) => {
    const exec = special ? (x.x ? ch : ch.toUpperCase()) : (x.x ? "x" : "-");
    return (x.r ? "r" : "-") + (x.w ? "w" : "-") + exec;
  };
  return triple(p.owner, p.setuid, "s") + triple(p.group, p.setgid, "s") + triple(p.other, p.sticky, "t");
}

export function fromSymbolic(text) {
  let t = text.trim();
  if (t.length === 10 && /^[-dlcbps]/.test(t)) t = t.slice(1);  // an `ls -l` mode string: drop the file-type character
  if (!/^[-rwxsStT]{9}$/.test(t)) throw new Error("Use 9 characters like rwxr-xr-x (or 10 as in `ls -l`)");
  const out = {};
  WHO.forEach((w, i) => {
    const [r, wr, x] = t.slice(i * 3, i * 3 + 3);
    const okR = r === "r" || r === "-", okW = wr === "w" || wr === "-";
    if (!okR || !okW) throw new Error(`Unexpected '${okR ? wr : r}' in the ${w} permissions`);
    const specialChars = i === 2 ? "tT" : "sS";
    if (!("-x" + specialChars).includes(x)) throw new Error(`Unexpected '${x}' in the ${w} permissions`);
    out[w] = { r: r === "r", w: wr === "w", x: x === "x" || x === "s" || x === "t" };
    if (i === 0) out.setuid = x === "s" || x === "S";
    if (i === 1) out.setgid = x === "s" || x === "S";
    if (i === 2) out.sticky = x === "t" || x === "T";
  });
  return out;
}

export function describe(p) {
  const parts = WHO.map(w => {
    const a = [p[w].r && "read", p[w].w && "write", p[w].x && "execute"].filter(Boolean);
    return `${w}: ${a.length ? a.join(", ") : "no access"}`;
  });
  if (p.setuid) parts.push("setuid (runs as the file's owner)");
  if (p.setgid) parts.push("setgid (runs as the file's group / new files inherit the group)");
  if (p.sticky) parts.push("sticky (only the owner can delete files in this directory)");
  return parts.join("; ");
}
