// Browser test for the server-backed tools (redirect tracer, dead-link checker).
// Needs: tests/e2e/site.py running (SITE_URL) and Hitchly started with HITCHLY_PROBE_ALLOW_PRIVATE=1.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const SITE = process.env.SITE_URL || 'http://127.0.0.1:8087';
const TOKEN = process.env.HITCHLY_TOKEN || 'smoke';
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const p = await b.newPage(); const bad = [];
  p.on('pageerror', e => bad.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') bad.push('console: ' + m.text()); });
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + extra)); };

  await p.goto(BASE + '/#/tracer'); await p.waitForSelector('input[type=password]');
  ok('tracer needs sign-in', true);
  await p.fill('#tok', TOKEN); await p.click('form.card button'); await p.waitForSelector('button:has-text("Trace")');

  await p.fill('main input[type=url]', SITE + '/a'); await p.click('button:has-text("Trace")');
  await p.waitForSelector('text=Reachable', { timeout: 8000 });
  const txt = await p.innerText('main');
  ok('tracer shows 2 redirects', txt.includes('2 redirects'), txt.slice(0, 300));
  ok('tracer shows final title', txt.includes('Hello World'));
  ok('tracer shows each hop', txt.includes('/b') && txt.includes('/c?x=1'));
  ok('tracer links to the status-code reference', await p.isVisible('main a[href="#/http"]'));

  await p.fill('main input[type=url]', SITE + '/missing'); await p.click('button:has-text("Trace")');
  await p.waitForSelector('text=Problem: HTTP 404', { timeout: 8000 }); ok('tracer reports 404', true);

  await p.fill('main input[type=url]', 'http://169.254.169.254/latest/meta-data/'); await p.click('button:has-text("Trace")');
  await p.waitForSelector('text=Problem:', { timeout: 8000 });
  // With probe_allow_private on (as here) the guard is off by design, so this link-local address just fails to connect.
  // The SSRF refusals themselves are tested in tests/test_probe.py and tests/test_api.py (ProbeApiTests).
  ok('an unreachable address is reported as a problem, not a crash', (await p.innerText('main')).includes('Problem:'));

  // checker: create links, run, delete the dead one
  await p.goto(BASE + '/#/links'); await p.waitForSelector('button:has-text("Shorten")');
  for (const [slug, path] of [['e2e-ok', '/c'], ['e2e-dead', '/missing']]) {
    await p.fill('input[type=url]', SITE + path); await p.locator('label:has-text("Custom slug") + input').fill(slug); await p.click('button:has-text("Shorten")');
    await p.waitForSelector(`a.short >> text=${slug}`);
  }
  await p.goto(BASE + '/#/checker'); await p.waitForSelector('button:has-text("Check all links")');
  await p.click('button:has-text("Check all links")'); await p.waitForSelector('text=with problems', { timeout: 15000 });
  const t2 = await p.innerText('main');
  ok('checker lists the dead link', t2.includes('e2e-dead') && t2.includes('HTTP 404'), t2.slice(0, 300));
  ok('checker does not list the healthy link', !t2.includes('e2e-ok'));
  p.on('dialog', d => d.accept());
  await p.locator('tr:has-text("e2e-dead") input[type=checkbox]').check(); await p.click('button:has-text("Delete selected")');
  await p.waitForSelector('tr:has-text("e2e-dead")', { state: 'detached', timeout: 5000 }); ok('dead link deleted from the checker', true);

  console.log(`\n${pass} passed, ${fail} failed`); console.log('console/CSP errors:', bad);
  await b.close(); process.exit(fail || bad.length ? 1 : 0);
})();
