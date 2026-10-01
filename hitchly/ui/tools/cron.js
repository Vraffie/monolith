import { h, field, input, select } from "../dom.js";
import { explainCron, nextRuns, parseCron } from "../lib/cron.js";

const PRESETS = [["Every minute", "* * * * *"], ["Every 15 minutes", "*/15 * * * *"], ["Hourly", "0 * * * *"], ["Daily at 09:00", "0 9 * * *"], ["Weekdays at 09:00", "0 9 * * 1-5"], ["Mondays at 08:30", "30 8 * * 1"], ["1st of the month", "0 0 1 * *"], ["Yearly", "0 0 1 1 *"]];

export default {
  id: "cron", title: "Cron explainer", group: "Format & convert", keywords: "crontab schedule job expression next run",
  blurb: "Paste a five-field cron expression to get a plain-English description and its next run times. Supports lists, ranges, steps, month/day names and @daily-style macros.",
  mount(root) {
    const expr = input({ value: "*/15 9-17 * * 1-5", spellcheck: "false", "aria-label": "Cron expression" });
    const clock = select([{ value: "utc", label: "UTC" }, { value: "local", label: "Your local time" }]);
    const count = select(["5", "10", "20"]);
    const says = h("p", { class: "big-says" }), list = h("ol"), err = h("div", { class: "err", role: "alert" }), fields = h("table");
    const run = () => {
      err.textContent = ""; says.textContent = ""; list.replaceChildren(); fields.replaceChildren();
      if (!expr.value.trim()) return;
      try {
        const c = parseCron(expr.value), utc = clock.value === "utc";
        says.textContent = explainCron(expr.value);
        for (const d of nextRuns(expr.value, new Date(), Number(count.value), { utc })) list.append(h("li", { class: "mono" }, utc ? d.toISOString().replace("T", " ").slice(0, 16) + " UTC" : d.toLocaleString()));
        if (!list.children.length) list.append(h("li", { class: "muted" }, "No run in the next 9 years (for example February 30)."));
        fields.append(h("tr", {}, ["Field", "Written", "Matches"].map(t => h("th", {}, t))),
          ...[["minute", c.minute], ["hour", c.hour], ["day of month", c.dom], ["month", c.month], ["day of week", c.dow]].map(([n, f]) => h("tr", {}, h("td", {}, n), h("td", { class: "mono" }, f.src),
            h("td", { class: "mono" }, f.values.length > 12 ? `${f.values.length} values` : f.values.join(", ")))));
      } catch (e) { err.textContent = e.message; }
    };
    for (const el of [expr, clock, count]) el.addEventListener("input", run);
    root.append(h("div", { class: "card" }, field("Expression (minute hour day-of-month month day-of-week)", expr), h("div", { class: "actions" },
      ...PRESETS.map(([label, v]) => h("button", { class: "ghost small", type: "button", onclick: () => { expr.value = v; run(); } }, label))), err),
      h("div", { class: "card" }, says, h("div", { class: "grid" }, field("Show times in", clock), field("How many", count)), list), h("div", { class: "card scroll" }, fields),
      h("p", { class: "muted" }, "When both day-of-month and day-of-week are restricted, the job runs when either matches (standard cron behaviour). Cron times follow the server's time zone, so check which one your scheduler uses."));
    run();
  },
};
