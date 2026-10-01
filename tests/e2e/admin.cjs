// Browser test for the admin tools: import, export, bulk shorten, maintenance. The server needs a FILE database (backups).
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const TOKEN = process.env.HITCHLY_TOKEN || 'smoke';
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const ctx = await b.newContext({ acceptDownloads: true });
  const p = await ctx.newPage(); const bad = [];
  p.on('pageerror', e => bad.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') bad.push('console: ' + m.text()); });
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(extra).slice(0, 300))); };
  const text = () => p.innerText('main');

  await p.goto(BASE + '/#/import'); await p.waitForSelector('#tok'); await p.fill('#tok', TOKEN); await p.click('form.card button');
  await p.waitForSelector('button:has-text("Run")');

  const csv = 'Long URL;Short Link;Group\nhttps://example.com/i1;https://bit.ly/imp-one;g\nhttps://example.com/i2;https://bit.ly/imp-two/;g\n;https://bit.ly/imp-nourl;g\n';
  await p.fill('main textarea', csv);
  await p.fill('label:has-text("CSV delimiter") + input', ';');
  await p.fill('label:has-text("Column for url") + input', 'Long URL');
  await p.fill('label:has-text("Column for slug") + input', 'Short Link');
  await p.check('label:has-text("keep the last path segment") input');
  await p.fill('label:has-text("Tag every imported link with") + input', 'imported');
  await p.click('button:has-text("Run")'); await p.waitForSelector('text=Dry run:');
  ok('dry run reports counts and creates nothing', (await text()).includes('2 of 3 rows would be sent') && (await text()).includes('Nothing was created'), await text());
  ok('dry run lists the unusable row', (await text()).includes("missing 'Long URL'"));
  await p.uncheck('label:has-text("Dry run") input'); await p.click('button:has-text("Run")'); await p.waitForSelector('text=Done:');
  ok('real import creates 2, fails 1', (await text()).includes('Done: 2 created, 0 skipped (slug already existed), 1 failed'), await text());
  await p.click('button:has-text("Run")'); await p.waitForSelector('text=2 skipped');
  ok('re-running skips existing slugs instead of failing', (await text()).includes('2 skipped'), await text());
  await p.fill('main textarea', 'Long URL;Short Link\n'); await p.fill('label:has-text("Column for url") + input', 'nope'); await p.click('button:has-text("Run")');
  await p.waitForSelector('.err:has-text("No \'nope\' column")'); ok('missing URL column names the columns found', (await p.innerText('.err')).includes('Found: Long URL, Short Link'));

  await p.goto(BASE + '/#/export'); await p.waitForSelector('button:has-text("Download JSON")');
  let [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download JSON")')]);
  const json = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  ok('JSON export has the imported links with tags', json.some(l => l.slug === 'imp-one' && l.tags.includes('imported')) && json.some(l => l.slug === 'imp-two'), JSON.stringify(json).slice(0, 200));
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download CSV")')]);
  const exported = fs.readFileSync(await dl.path(), 'utf8');
  ok('CSV export has header and rows', exported.startsWith('slug,url,short_url,created_at') && exported.includes('imp-one'), exported.slice(0, 120));

  await p.goto(BASE + '/#/bulk'); await p.waitForSelector('button:has-text("Shorten all")');
  await p.fill('main textarea', 'https://example.com/b1\nhttps://example.com/b2 bulk-two\nnot-a-url\nhttps://example.com/b4 bulk-two');
  await p.click('button:has-text("Shorten all")'); await p.waitForSelector('text=created,');
  const bt = await text();
  ok('bulk: 2 created 2 failed', bt.includes('2 created, 2 failed'), bt.slice(0, 200));
  ok('bulk: shows short links and reasons', bt.includes('/bulk-two') && bt.includes('slug already in use'), bt);

  await p.goto(BASE + '/#/maintenance'); await p.waitForSelector('text=Human visits');
  ok('maintenance shows overview', (await text()).includes('Version') && /Links\s*\n?\s*\d+/.test(await text()), await text());
  [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download backup")')]);
  const head = fs.readFileSync(await dl.path()).subarray(0, 15).toString();
  ok('backup is a real SQLite file', head === 'SQLite format 3', head);
  p.once('dialog', d => d.accept()); await p.click('button:has-text("Purge expired links")'); await p.waitForSelector('text=Removed');
  ok('purge reports removal count', (await text()).includes('Removed 0 expired link(s)'), await text());

  console.log(`\n${pass} passed, ${fail} failed`); console.log('console/CSP errors:', bad);
  await b.close(); process.exit(fail || bad.length ? 1 : 0);
})();
