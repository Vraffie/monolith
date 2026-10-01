// The manifest (tools/index.js) duplicates each tool's metadata so navigation needs no tool code. This keeps them identical.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { tools, GROUPS } from "../../hitchly/ui/tools/index.js";

// Tool modules import the DOM helpers, which touch `document` only when called, so importing them in Node is safe.
test("manifest matches every tool module's own metadata", async () => {
  for (const entry of tools) {
    const mod = await entry.load();
    for (const key of ["id", "title", "group", "blurb", "needsAuth"]) {
      assert.equal(mod[key] ?? false, entry[key], `${entry.id}: '${key}' differs between the tool and the manifest`);
    }
    assert.equal(mod.keywords ?? "", entry.keywords, `${entry.id}: keywords differ`);
    assert.equal(typeof mod.mount, "function", `${entry.id}: no mount()`);
    assert.ok(GROUPS.includes(entry.group), `${entry.id}: unknown group ${entry.group}`);
  }
});

test("every tool file is registered exactly once, ids are unique and URL-safe", () => {
  const files = readdirSync(new URL("../../hitchly/ui/tools/", import.meta.url)).filter(f => f.endsWith(".js") && f !== "index.js").sort();
  const registered = tools.map(t => `${t.id}`);
  assert.equal(new Set(registered).size, tools.length, "duplicate tool ids");
  for (const t of tools) assert.match(t.id, /^[a-z0-9-]+$/);
  assert.equal(files.length, tools.length, `files on disk (${files.length}) vs manifest entries (${tools.length})`);
});
