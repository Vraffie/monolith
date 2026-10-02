// Browser tests. Serve site/ first:  python3 -m http.server 8091 -d site     (CATALOG_ZIP=<package.zip> adds a run on a real package)
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8091';
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 1400, height: 850 } })).newPage(), bad = [];
  p.on('pageerror', e => bad.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') bad.push('console: ' + m.text()); });
  p.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) bad.push('remote request: ' + r.url()); });
  let pass = 0, fail = 0;
  const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + String(x).slice(0, 250))); };
  const node = key => p.locator('.node', { has: p.locator('text.lbl', { hasText: new RegExp('^' + key + '$') }) });

  await p.goto(BASE + '/');
  ok('empty state explains what to do', (await p.innerText('#empty')).includes('Open an offer-configuration package') && await p.isHidden('#app'));
  await p.click('#sampleBtn'); await p.waitForSelector('.node');
  ok('sample loads: summary and boxes', /3 offers · 10 feature groups · 11 charge clusters/.test(await p.innerText('#meta')) && (await p.$$('.node')).length === 31, (await p.$$('.node')).length);
  const total = (await p.$$('.node')).length;
  ok('columns are titled', (await p.$$('.colhead')).length === 7);
  ok('references outside the files are hidden until asked for', (await p.$$('.node.missing')).length === 0);
  await p.check('text=Elsewhere >> input'); ok('"Elsewhere" shows the dashed boxes', (await p.$$('.node.missing')).length >= 1); await p.uncheck('text=Elsewhere >> input');

  // folder scope
  const folders = await p.$$eval('#dirs option', o => o.map(x => x.value));
  ok('folder box suggests the folders that hold XML', folders.includes('NL_HOME_PLUS') && folders.includes('NL_HOME_PLUS/chargeClusters') && !folders.includes('NL_HOME_PLUS/prices'), folders.join());
  await p.fill('#scope', 'NL_HOME_PLUS/chargeClusters'); await p.press('#scope', 'Enter'); await p.waitForTimeout(250);
  ok('choosing a folder analyses only its files', (await p.innerText('#scopeInfo')).startsWith('11 of 34') && (await p.$$('.node')).length === 11 && /0 offers/.test(await p.innerText('#meta')), (await p.innerText('#scopeInfo')) + ' ' + (await p.$$('.node')).length);
  await p.fill('#scope', 'does/not/exist'); await p.press('#scope', 'Enter'); await p.waitForTimeout(150);
  ok('an unknown folder says so and keeps the current view', (await p.innerText('#toast')).includes('No files under') && (await p.$$('.node')).length === 11);
  await p.fill('#scope', ''); await p.press('#scope', 'Enter'); await p.waitForTimeout(250);
  ok('clearing the folder returns to the whole package', (await p.innerText('#scopeInfo')).startsWith('34 of 34') && (await p.$$('.node')).length === 31);

  // selection, trace, details
  await node('HOME_PLUS_FREE_OV').click();
  ok('selecting a box lights up its chain and dims the rest', (await p.$$('.node.dim')).length > 10 && (await p.$$('.edge.on')).length >= 4);
  const side = await p.innerText('.side');
  ok('details: finding, chart and price table', /ERROR.*-1279.*1299/s.test(side) && (await p.$$('.side svg.chart')).length === 1 && side.includes('2026-01-01'), side.slice(0, 300));
  await p.click('.side button:has-text("Isolate")'); await p.waitForTimeout(150);
  ok('isolate keeps only the connected boxes', (await p.$$('.node')).length < 15 && (await p.innerText('.side')).includes('(isolated)'));
  await p.click('.side button:has-text("Isolate")'); ok('isolate toggles off', (await p.$$('.node')).length === total);
  await p.click('.side button:has-text("Clear")'); ok('clear deselects', (await p.$$('.node.sel')).length === 0);

  // keyboard
  await node('ETC').first().focus(); await p.keyboard.press('Enter');
  ok('keyboard: Enter selects a focused box', (await p.innerText('.side h2')) === 'ETC');
  await p.locator('.side button.link-btn').first().click(); await p.waitForTimeout(100);
  ok('details links navigate between boxes', (await p.$$('.node.sel')).length === 1);

  // search, layer toggles, dependencies
  await p.fill('input[aria-label="Find a box"]', 'sport'); await p.waitForTimeout(100);
  ok('search highlights matches and dims the others', (await p.$$('.node.hit')).length === 2 && (await p.$$('.node.dim')).length >= 25, (await p.$$('.node.hit')).length);
  await p.fill('input[aria-label="Find a box"]', '');
  await p.uncheck('text=Tax >> input'); await p.uncheck('text=Bill types >> input'); await p.waitForTimeout(100);
  ok('layer toggles remove columns', (await p.$$('.colhead')).length === 5);
  await p.check('text=Tax >> input'); await p.check('text=Bill types >> input');
  await p.check('text=Dependencies >> input'); await p.waitForTimeout(100);
  ok('dependencies draw excludes/requires arcs', (await p.$$('path.l-excludes')).length === 1 && (await p.$$('path.l-requires')).length === 1);

  // as-of date
  await p.fill('#asOf', '2025-06-01'); await p.dispatchEvent('#asOf', 'change'); await p.waitForTimeout(200);
  ok('changing the date changes the prices on the boxes', (await node('HOME_PLUS').first().textContent()).replace(/\s/g, ' ').includes('1 249,00') || (await node('HOME_PLUS').first().textContent()).includes('1 249,00'), await node('HOME_PLUS').first().textContent());
  await p.fill('#asOf', '2027-01-01'); await p.dispatchEvent('#asOf', 'change'); await p.waitForTimeout(200);
  ok('...and later dates show later prices', /1.299,00/.test(await node('HOME_PLUS').first().textContent()));

  // pan & zoom
  const t0 = await p.getAttribute('svg > g:not(defs)', 'transform');
  await p.click('button[aria-label="Zoom in"]'); const t1 = await p.getAttribute('svg > g:not(defs)', 'transform');
  const box = await p.locator('.stage svg').boundingBox(); await p.mouse.move(box.x + 300, box.y + 600); await p.mouse.down(); await p.mouse.move(box.x + 380, box.y + 640); await p.mouse.up();
  const t2 = await p.getAttribute('svg > g:not(defs)', 'transform');
  ok('zoom and drag-to-pan change the view', t0 !== t1 && t1 !== t2, [t0, t1, t2].join(' | '));
  await p.click('button:has-text("Fit")');

  await p.fill('#asOf', '2025-06-01'); await p.dispatchEvent('#asOf', 'change'); await p.waitForTimeout(200);
  // prices tab
  await p.click('#tab-prices'); await p.waitForSelector('tbody tr');
  ok('prices tab lists every charge with the next change', (await p.$$('tbody tr')).length === 11 && (await p.innerText('main')).includes('2026-01-01'), (await p.$$('tbody tr')).length);
  ok('prices tab flags timelines with problems', (await p.innerText('main')).includes('1 timeline issue'));
  await p.click('tbody tr:has-text("HOME_PLUS_FREE_OV")'); ok('clicking a row shows its chart', (await p.$$('main svg.chart')).length === 1, (await p.$$('main svg.chart')).length);
  await p.click('main button:has-text("Show in graph")'); await p.waitForSelector('.node.sel'); ok('"Show in graph" returns to the graph with the box selected', (await p.innerText('.side h2')) === 'HOME_PLUS_FREE_OV');

  // checks tab
  await p.click('#tab-checks'); await p.waitForSelector('.finding');
  ok('checks: errors and warnings shown, notes hidden by default', (await p.$$('.finding .sev-t-info')).length === 0 && (await p.$$('.finding .sev-t-error')).length === 3);
  await p.check('text=info (' + (await p.innerText('label:has-text("info (") ')).match(/\((\d+)\)/)[1] + ') >> input'); ok('notes can be shown', (await p.$$('.finding .sev-t-info')).length > 0);
  await p.fill('input[aria-label="Filter findings"]', '-1279'); await p.waitForTimeout(100); ok('checks: filter by text', (await p.$$('.finding')).length === 1);
  await p.click('.finding button:has-text("show in graph")'); await p.waitForSelector('.node.sel'); ok('checks: "show in graph" selects the box', (await p.innerText('.side h2')).length > 0);

  // errors: bad files
  await p.setInputFiles('#zipIn', { name: 'bad.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') }); await p.waitForTimeout(200);
  ok('a file that is not a zip gives a readable message, not a crash', (await p.innerText('#toast')).includes('not a zip'));
  await p.setInputFiles('#dirIn', require('path').join(__dirname, 'fixtures', 'broken')); await p.waitForSelector('.node, #checkBadge'); await p.waitForTimeout(200);
  await p.click('#tab-checks'); ok('broken XML is reported as a finding', (await p.innerText('main')).includes('Not well-formed XML'));

  // several zips merge so references resolve
  const sample = fs.readFileSync(require('path').join(__dirname, '..', 'site', 'data', 'sample.zip'));
  await p.setInputFiles('#zipIn', [{ name: 'one.zip', mimeType: 'application/zip', buffer: sample }, { name: 'two.zip', mimeType: 'application/zip', buffer: sample }]); await p.waitForTimeout(400);
  await p.click('#tab-checks'); ok('loading two packages together flags duplicate keys', (await p.innerText('main')).includes('is also defined in'));

  if (process.env.CATALOG_ZIP) {
    await p.setInputFiles('#zipIn', process.env.CATALOG_ZIP); await p.click('#tab-graph'); await p.waitForSelector('.node');
    ok('real package: graph renders without errors', (await p.$$('.node')).length > 20);
  }
  ok('no page errors, console errors or remote requests', bad.length === 0, bad.join(' | '));
  console.log(`catalog-lens: ${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
