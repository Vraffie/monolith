const { chromium } = require('playwright');
const fs = require('fs');
// Accessibility + mobile-layout audit of every tool. Needs: npm i playwright axe-core. Exits 1 on any violation or overflow.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const IDS = ['links','bulk','qr','tracer','utm','url-parser','base64','url-encode','jwt','hash','uuid','password','json','time','color','regex','text','radix','checker','import','export','maintenance'];
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const summary = {};
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ colorScheme: scheme, bypassCSP: true, viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => localStorage.setItem('hitchly_token', 'audit'));
    const p = await ctx.newPage();
    for (const id of IDS) {
      await p.goto(`${BASE}/#/${id}`); await p.waitForSelector('main h1'); await p.waitForTimeout(250);
      await p.evaluate(axeSrc);
      const r = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice'] })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes[0].target.join(' ').slice(0, 90) })));
      for (const v of r) { const k = `${v.id}|${v.impact}|${v.help}`; (summary[k] ||= { scheme: new Set(), tools: new Set(), n: 0, sample: v.sample }); summary[k].scheme.add(scheme); summary[k].tools.add(id); summary[k].n += v.n; }
    }
    await ctx.close();
  }
  console.log('=== axe violations (wcag2a/aa, 2.1 a/aa, best-practice) across 22 tools x light+dark');
  const rows = Object.entries(summary).sort((a, b) => (b[1].tools.size - a[1].tools.size));
  if (!rows.length) console.log('none');
  for (const [k, v] of rows) { const [id, impact, help] = k.split('|'); console.log(`- [${impact}] ${id}: ${help}\n    tools(${v.tools.size}): ${[...v.tools].join(', ')} | schemes: ${[...v.scheme].join('+')} | e.g. ${v.sample}`); }

  // mobile layout: horizontal overflow and tap-target sizes
  const mctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, bypassCSP: true });
  await mctx.addInitScript(() => localStorage.setItem('hitchly_token', 'audit'));
  const m = await mctx.newPage();
  console.log('\n=== mobile 390px: horizontal overflow per tool');
  let overflow = 0;
  for (const id of IDS) {
    await m.goto(`${BASE}/#/${id}`); await m.waitForSelector('main h1'); await m.waitForTimeout(200);
    const o = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    if (o.sw > o.iw + 1) { overflow++; console.log(`- OVERFLOW ${id}: content ${o.sw}px wide in a ${o.iw}px viewport`); }
  }
  if (!overflow) console.log('none');
  await m.goto(`${BASE}/#/qr`); await m.waitForTimeout(300); await m.screenshot({ path: '/tmp/claude-0/m-qr.png' });
  await m.goto(`${BASE}/#/links`); await m.waitForTimeout(300); await m.screenshot({ path: '/tmp/claude-0/m-links.png' });
  const small = await m.evaluate(() => [...document.querySelectorAll('button, a, input, select')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 24 || r.width < 24); }).length);
  console.log(`\nsmall (<24px) interactive elements on the Links page at mobile width: ${small}`);
  await b.close();
  process.exit(rows.length || overflow ? 1 : 0);
})();
