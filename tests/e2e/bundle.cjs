// Verifies dist/hitchly-toolbox.html (run `node scripts/bundle.mjs` first): reproducible, self-contained, offline, CSP-pinned.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync, mkdtempSync, copyFileSync } = require('node:fs');
const path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '../..'), file = path.join(root, 'dist/hitchly-toolbox.html');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(extra).slice(0, 300))); };
const sha = s => createHash('sha256').update(s).digest('base64');

(async () => {
  // reproducibility: building again gives byte-identical output
  const first = readFileSync(file);
  execFileSync('node', [path.join(root, 'scripts/bundle.mjs')], { cwd: root, stdio: 'ignore' });
  ok('build is reproducible (identical bytes on a second build)', Buffer.compare(first, readFileSync(file)) === 0);

  const html = readFileSync(file, 'utf8');
  const script = /<script type="module">([\s\S]*)<\/script>/.exec(html)[1], style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  ok('CSP pins the inline script by its real hash', csp.includes(`script-src 'sha256-${sha(script)}'`));
  ok('CSP pins the inline style by its real hash', csp.includes(`style-src 'sha256-${sha(style)}'`));
  ok("CSP forbids all network access (connect-src 'none') and unsafe-inline", csp.includes("connect-src 'none'") && !csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
  ok('no external resource references (src/href/url to http(s)://)', !/(?:src|href)\s*=\s*["']https?:/i.test(html) && !/url\(\s*["']?https?:/i.test(html) && !/@import/i.test(html));
  ok('exactly one script and one style block', (html.match(/<script/g) || []).length === 1 && (html.match(/<style/g) || []).length === 1);
  ok('size budget: under 250 KB raw', html.length < 250 * 1024, html.length);

  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const url = 'file://' + file;
  const ctx = await b.newContext(); const p = await ctx.newPage(); const bad = [], remote = [];
  p.on('console', m => { if (m.type() === 'error') bad.push(m.text()); }); p.on('pageerror', e => bad.push('pageerror: ' + e.message));
  p.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) remote.push(r.url()); });
  await p.goto(url + '#/base64'); await p.waitForSelector('nav a'); await p.waitForTimeout(500);
  ok('opens from file:// and builds the navigation (23 entries, 42 tools)', (await p.$$('nav a')).length === 23);
  await p.fill('main textarea', 'hello'); await p.waitForTimeout(100);
  ok('a tool works offline', (await p.locator('.out pre').first().innerText()) === 'aGVsbG8=');
  await p.goto(url + '#/links'); await p.waitForTimeout(300);
  ok('server-backed tools explain they need a server instead of asking for a token', (await p.innerText('main')).includes('needs a Hitchly server') && !(await p.$('#tok')));
  await p.goto(url + '#/regex'); await p.waitForSelector('main h1'); await p.fill('main label:has-text("Pattern") + input', '(a+)+$'); await p.fill('main textarea', 'a'.repeat(40) + 'b');
  await p.waitForSelector('text=Stopped after', { timeout: 6000 }).then(() => ok('the regex worker (started from an embedded Blob) still kills runaway patterns', true)).catch(() => ok('regex worker from Blob', false));
  ok('no network request of any kind was attempted', remote.length === 0, remote.join(', '));
  ok('no console errors or CSP violations', bad.length === 0, bad.join(' | '));
  await ctx.close();

  // tamper test: change one character of the inline script; the CSP hash no longer matches, so the browser must refuse to run it
  const dir = mkdtempSync(path.join(os.tmpdir(), 'bundle-')), evil = path.join(dir, 'evil.html');
  writeFileSync(evil, html.replace(script, script.replace('hitchly_token', 'hitchly_tokeX')));
  const c2 = await b.newContext(); const q = await c2.newPage(); const violations = [];
  q.on('console', m => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await q.goto('file://' + evil + '#/base64'); await q.waitForTimeout(800);
  ok('a modified bundle is blocked by its own CSP (no navigation rendered)', (await q.$$('nav a')).length === 0 && violations.length > 0, `${(await q.$$('nav a')).length} nav links, ${violations.length} CSP messages`);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
