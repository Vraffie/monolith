// Navigation: bundled tools with tabs, sub-headings, old deep links, search through bundles.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const U = id => (process.env.BUNDLE ? `${BASE}#/${id}` : `${BASE}/#/${id}`);
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const p = await (await b.newContext()).newPage(); const bad = [];
  p.on('pageerror', e => bad.push(e.message)); p.on('console', m => { if (m.type() === 'error') bad.push(m.text()); });
  let pass = 0, fail = 0;
  const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + String(x).slice(0, 200))); };
  const go = async id => { await p.goto(U(id)); await p.waitForSelector('main h1'); await p.waitForTimeout(150); };
  await go('base64');
  ok('old link #/base64 still opens Base64, under the "Text encoders" bundle', (await p.innerText('main h1')) === 'Text encoders' && (await p.innerText('main .tabs a[aria-current=page]')) === 'Base64');
  ok('nav highlights the bundle', (await p.innerText('nav a[aria-current=page]')).startsWith('Text encoders'));
  await p.click('main .tabs a:has-text("URL")'); await p.waitForTimeout(200);
  ok('tab switches tool and the URL', p.url().endsWith('#/url-encode') && (await p.innerText('main .tabs a[aria-current=page]')) === 'URL');
  await go('encoders'); ok('bundle id opens its first tab', (await p.innerText('main .tabs a[aria-current=page]')) === 'Base64');
  ok('tabs of Text encoders are 4', (await p.$$('main .tabs a')).length === 4);
  const heads = await p.$$eval('nav h3', e => e.map(x => x.textContent));
  ok('sub-headings exist', heads.includes('Crypto') && heads.includes('Values') && heads.includes('Developer helpers'), heads.join());
  await p.fill('#toolSearch', 'jwt'); await p.waitForTimeout(100);
  const vis = await p.$$eval('nav a:not([hidden])', e => e.map(x => x.textContent.trim()));
  ok('search finds a tool inside a bundle', vis.length === 1 && vis[0].startsWith('Hash, JWT'), vis.join());
  ok('empty sub-headings are hidden while searching', (await p.$$eval('nav h3:not([hidden])', e => e.length)) <= 1);
  await p.fill('#toolSearch', ''); await go('totp'); ok('deep link to a tool inside a bundle', (await p.innerText('main h1')) === 'IDs, passwords & keys' && (await p.innerText('main .tabs a[aria-current=page]')) === 'TOTP');
  ok('no errors', bad.length === 0, bad.join('|'));
  console.log(`nav: ${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
