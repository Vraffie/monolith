/** Five-field cron (minute hour day-of-month month day-of-week): parsing, English explanation and next run times. */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MACROS = { "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *" };
const SPECS = [
  { name: "minute", min: 0, max: 59 }, { name: "hour", min: 0, max: 23 }, { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12, names: MONTHS, nameBase: 1 }, { name: "day of week", min: 0, max: 7, names: DAYS, nameBase: 0 },
];

function parseField(src, spec) {
  const values = new Set();
  let everyStep = null;
  for (const part of src.split(",")) {
    if (!part) throw new Error(`Empty item in the ${spec.name} field`);
    const [range, stepText, extra] = part.split("/");
    if (extra !== undefined) throw new Error(`Too many '/' in the ${spec.name} field`);
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || +stepText < 1) throw new Error(`The step in the ${spec.name} field must be a positive whole number`);
      step = +stepText;
    }
    const num = t => {
      if (/^\d+$/.test(t)) return +t;
      const i = spec.names ? spec.names.indexOf(t.toUpperCase()) : -1;
      if (i < 0) throw new Error(`'${t}' is not valid in the ${spec.name} field`);
      return i + spec.nameBase;
    };
    let lo, hi;
    if (range === "*") { lo = spec.min; hi = spec.name === "day of week" ? 6 : spec.max; if (stepText !== undefined) everyStep = step; }
    else if (range.includes("-")) { const [a, b, c] = range.split("-"); if (c !== undefined) throw new Error(`Bad range '${range}' in the ${spec.name} field`); lo = num(a); hi = num(b); }
    else { lo = num(range); hi = stepText !== undefined ? spec.max : lo; }
    if (lo < spec.min || hi > spec.max || lo > hi) throw new Error(`${spec.name} must be between ${spec.min} and ${spec.max} (got '${part}')`);
    for (let x = lo; x <= hi; x += step) values.add(spec.name === "day of week" && x === 7 ? 0 : x);
  }
  return { values: [...values].sort((a, b) => a - b), star: src.startsWith("*"), everyStep, src };
}

export function parseCron(expr) {
  let text = expr.trim().replace(/\s+/g, " ");
  if (text.startsWith("@")) {
    if (text === "@reboot") throw new Error("@reboot runs at boot, not on a schedule, so it has no run times");
    if (!MACROS[text]) throw new Error(`Unknown macro ${text}`);
    text = MACROS[text];
  }
  const parts = text.split(" ");
  if (parts.length !== 5) throw new Error(`Expected 5 fields (minute hour day-of-month month day-of-week), got ${parts.length}`);
  const [minute, hour, dom, month, dow] = parts.map((p, i) => parseField(p, SPECS[i]));
  return { minute, hour, dom, month, dow };
}

/** Next `count` run times strictly after `from`. `utc` picks the clock; Vixie rule: if both day fields are restricted, either may match. */
export function nextRuns(expr, from = new Date(), count = 5, { utc = true } = {}) {
  const c = parseCron(expr), out = [];
  const [Y, Mo, D, H, Mi, mk] = utc
    ? [d => d.getUTCFullYear(), d => d.getUTCMonth(), d => d.getUTCDate(), d => d.getUTCHours(), d => d.getUTCMinutes(), (y, mo, d, h, mi) => new Date(Date.UTC(y, mo, d, h, mi))]
    : [d => d.getFullYear(), d => d.getMonth(), d => d.getDate(), d => d.getHours(), d => d.getMinutes(), (y, mo, d, h, mi) => new Date(y, mo, d, h, mi)];
  const start = mk(Y(from), Mo(from), D(from), 0, 0);
  const domAny = c.dom.star, dowAny = c.dow.star;
  for (let day = 0; day < 366 * 9 && out.length < count; day++) {
    const base = mk(Y(start), Mo(start), D(start) + day, 0, 0);
    const mo = Mo(base) + 1, dom = D(base), dow = (utc ? base.getUTCDay() : base.getDay());
    if (!c.month.values.includes(mo)) continue;
    const domOk = c.dom.values.includes(dom), dowOk = c.dow.values.includes(dow);
    if (!(domAny && dowAny ? true : domAny ? dowOk : dowAny ? domOk : domOk || dowOk)) continue;
    for (const h of c.hour.values) for (const mi of c.minute.values) {
      const t = mk(Y(base), Mo(base), D(base), h, mi);
      if (H(t) !== h || Mi(t) !== mi) continue;  // a local time skipped by a DST change
      if (t > from && out.length < count) out.push(t);
    }
  }
  return out;
}

const pad = n => String(n).padStart(2, "0");
function listText(values, names = null) {
  const label = v => (names ? names[v] : String(v));
  const runs = []; let i = 0;
  while (i < values.length) { let j = i; while (j + 1 < values.length && values[j + 1] === values[j] + 1) j++; runs.push([values[i], values[j]]); i = j + 1; }
  const parts = runs.map(([a, b]) => (a === b ? label(a) : b === a + 1 ? `${label(a)} and ${label(b)}` : `${label(a)} through ${label(b)}`));
  return parts.length <= 1 ? parts.join("") : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

export function explainCron(expr) {
  const c = parseCron(expr), { minute: mi, hour: h } = c;
  let time;
  if (mi.star && h.star && !mi.everyStep) time = "Every minute";
  else if (mi.everyStep && h.star && mi.values.length > 1) time = `Every ${mi.everyStep} minutes`;
  else if (mi.values.length === 1 && h.values.length === 1) time = `At ${pad(h.values[0])}:${pad(mi.values[0])}`;
  else if (mi.values.length === 1 && h.star) time = mi.values[0] === 0 ? "At the start of every hour" : `At minute ${mi.values[0]} past every hour`;
  else if (mi.values.length === 1) time = `At minute ${mi.values[0]} past hour ${listText(h.values)}`;
  else if (h.values.length === 1) time = `At ${mi.everyStep ? `every ${mi.everyStep} minutes` : `minutes ${listText(mi.values)}`} past hour ${h.values[0]}`;
  else time = `At minutes ${listText(mi.values)} past hours ${listText(h.values)}`;
  const parts = [];
  const domText = c.dom.star ? "" : `day-of-month ${listText(c.dom.values)}`;
  const dowText = c.dow.star ? "" : listText(c.dow.values, DAY_NAMES);
  if (domText && dowText) parts.push(`on ${domText} or on ${dowText} (when both are set, either matches)`);
  else if (domText) parts.push(`on ${domText}`);
  else if (dowText) parts.push(`on ${dowText}`);
  if (!c.month.star) parts.push(`in ${listText(c.month.values.map(v => v - 1), MONTH_NAMES)}`);
  return [time, ...parts].join(", ");
}
