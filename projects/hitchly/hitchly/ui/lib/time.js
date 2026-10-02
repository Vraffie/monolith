/** Parse "now", Unix seconds/milliseconds (auto-detected) or anything Date understands. Returns a Date or throws. */
export function parseTime(input, now = Date.now()) {
  const s = input.trim();
  if (!s || s.toLowerCase() === "now") return new Date(now);
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    // 11+ digits can't be seconds for any date before year 5138, so treat them as milliseconds
    return new Date(Math.abs(n) >= 1e11 ? n : n * 1000);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("Could not understand that date. Try a Unix timestamp or an ISO date like 2026-10-01T12:00:00Z");
  return d;
}

export function relative(date, now = Date.now()) {
  const diff = Math.round((date.getTime() - now) / 1000), abs = Math.abs(diff);
  const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
  if (abs < 1) return "now";
  const [name, size] = units.find(([, sz]) => abs >= sz);
  const n = Math.floor(abs / size);
  const label = `${n} ${name}${n === 1 ? "" : "s"}`;
  return diff > 0 ? `in ${label}` : `${label} ago`;
}

export function inZone(date, timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23", timeZoneName: "short",
    }).format(date).replace(",", "");
  } catch { throw new Error("Unknown time zone " + timeZone); }
}

export function formats(date, timeZone, now = Date.now()) {
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  return {
    "Unix seconds": String(Math.floor(date.getTime() / 1000)),
    "Unix milliseconds": String(date.getTime()),
    "ISO 8601 (UTC)": date.toISOString(),
    "RFC 2822 (UTC)": date.toUTCString(),
    [timeZone]: inZone(date, timeZone),
    "Relative": relative(date, now),
  };
}
