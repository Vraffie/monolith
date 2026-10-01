// End-to-end browser test. Needs: npm i playwright && npx playwright install chromium
// Usage: BASE_URL=http://127.0.0.1:8080 HITCHLY_TOKEN=... node tests/e2e/<file>.cjs   (exit code 1 on failure)
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
// BUNDLE=1: BASE_URL is the file:// URL of dist/hitchly-toolbox.html (no trailing slash before the #)
const U = id => (process.env.BUNDLE ? `${BASE}#/${id}` : `${BASE}/#/${id}`);
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args:['--no-sandbox'] });
  const ctx = await b.newContext({ permissions: ['clipboard-read','clipboard-write'] });
  const p = await ctx.newPage(); const bad=[];
  p.on('pageerror', e=>bad.push('pageerror: '+e.message));
  p.on('console', m=>{ if (m.type()==='error') bad.push('console: '+m.text()); });
  let pass=0, fail=0;
  const ok = (name, cond, extra='') => { cond ? pass++ : fail++; console.log((cond?'PASS ':'FAIL ')+name+(cond?'':'  -> '+extra)); };
  const go = async id => { await p.goto(U(id)); await p.waitForSelector('main h1'); await p.waitForTimeout(80); };
  const out = async n => (await p.locator('.out pre').nth(n).innerText());

  await p.goto(process.env.BUNDLE ? BASE : BASE+'/'); await p.waitForSelector('nav a');
  ok('nav lists 23 entries (42 tools)', (await p.$$('nav a')).length === 23, String((await p.$$('nav a')).length));

  await go('base64'); await p.fill('textarea','hello'); await p.waitForTimeout(80);
  ok('base64 encode', (await out(0)) === 'aGVsbG8=', await out(0));
  await p.selectOption('select >> nth=0','dec'); await p.fill('textarea','aGVsbG8'); await p.waitForTimeout(80);
  ok('base64 decode w/o padding', (await out(0)) === 'hello');
  await p.fill('textarea','!!!'); await p.waitForTimeout(80);
  ok('base64 error shown', (await p.innerText('.err')).includes('Not valid Base64'));

  await go('url-encode'); await p.fill('textarea','a b&c=é'); await p.waitForTimeout(80);
  ok('url encode', (await out(0)) === 'a%20b%26c%3D%C3%A9', await out(0));

  await go('jwt');
  const seg = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  await p.fill('textarea', [seg({alg:'HS256',typ:'JWT'}), seg({name:'Jane',exp:1}), 'sig'].join('.')); await p.waitForTimeout(100);
  ok('jwt payload', (await out(1)).includes('Jane'));
  ok('jwt says expired + not verified', (await p.innerText('main')).includes('expired') && (await p.innerText('main')).includes('signature not verified'));

  await go('hash'); await p.fill('textarea >> nth=0','abc'); await p.waitForTimeout(250);
  ok('sha-256 of abc', (await p.innerText('main')).includes('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));

  await go('uuid'); await p.click('button:has-text("Generate")'); await p.waitForTimeout(80);
  ok('uuid x5', (await out(0)).split('\n').length === 5);
  await p.selectOption('select >> nth=0','7'); await p.click('button:has-text("Generate")');
  ok('uuid v7', /^[0-9a-f]{8}-[0-9a-f]{4}-7/.test((await out(0)).split('\n')[0]));

  await go('password'); await p.click('button:has-text("Generate")'); await p.waitForTimeout(80);
  ok('password length 20', (await out(0)).length === 20);
  ok('entropy label', /bits of entropy/.test(await p.innerText('main')));
  await p.click('button:has-text("Hex token")'); ok('hex token 64 chars', (await out(1)).length === 64);

  await go('json'); await p.fill('textarea','{"b":1,"a":[1,2]}'); await p.waitForTimeout(80);
  ok('json pretty', (await out(0)).includes('\n  "b": 1'));
  await p.fill('textarea','{"a":1,}'); await p.waitForTimeout(80);
  ok('json error with position', /line \d+/.test(await p.innerText('main')), await p.innerText('main'));

  await go('time'); ok('time table rows', (await p.$$('table tr')).length >= 5);
  await p.fill('main input >> nth=0','1700000000'); await p.waitForTimeout(80);
  ok('time unix->iso', (await p.innerText('main')).includes('2023-11-14T22:13:20.000Z'));

  await go('color'); await p.fill('input[type=text] >> nth=0','#000000'); await p.waitForTimeout(80);
  ok('contrast 21', (await p.innerText('main')).includes('21.00:1'), (await p.innerText('main')).slice(0,200));

  await go('regex'); await p.fill('main input >> nth=0','(\\d+)'); await p.fill('textarea','a1b22'); await p.waitForTimeout(600);
  ok('regex 2 matches', (await p.innerText('main')).includes('2 matches'));
  await p.fill('main input >> nth=0','(a+)+$'); await p.fill('textarea','a'.repeat(40)+'b'); 
  await p.waitForSelector('text=Stopped after', {timeout: 6000}).then(()=>ok('catastrophic regex stopped by worker timeout', true)).catch(()=>ok('catastrophic regex stopped by worker timeout', false, await0()));
  function await0(){return 'timeout never fired';}
  ok('page still responsive after runaway regex', await p.evaluate(()=>1+1) === 2);
  await p.fill('main input >> nth=0','('); await p.waitForTimeout(500);
  ok('invalid regex reported', (await p.innerText('main')).toLowerCase().includes('invalid') || (await p.innerText('main')).toLowerCase().includes('unterminated'), (await p.innerText('main')).slice(0,200));

  await go('text'); await p.fill('textarea','Héllo Wörld Foo'); await p.waitForTimeout(80);
  ok('slug', (await out(0)) === 'hello-world-foo', await out(0));

  await go('radix'); await p.waitForTimeout(80);
  ok('radix 255 -> ff', (await p.innerText('main')).includes('ff'));
  await p.fill('main input >> nth=0','xyz'); await p.selectOption('select','2'); await p.waitForTimeout(80);
  ok('radix invalid digit error', (await p.innerText('.err')).includes('not a valid base-2'));

  await go('qr'); await p.waitForSelector('img[alt="QR code"]', { state: 'attached' }).catch(()=>{});
  await p.fill('main textarea','https://example.com/hello'); await p.waitForSelector('img[alt="QR code"]');
  ok('qr text renders', await p.isVisible('img[alt="QR code"]'));
  await p.selectOption('main select >> nth=0','wifi'); await p.fill('label:has-text("Network name") + input','Home'); await p.waitForTimeout(80);
  ok('qr wifi asks for password', (await p.innerText('.err')).includes('password is required'));

  await go('utm'); await p.fill('input[type=url]','https://example.com/p?a=1'); await p.fill('input[placeholder^="newsletter"]','News'); await p.waitForTimeout(100);
  ok('utm built', (await out(0)) === 'https://example.com/p?a=1&utm_source=News', await out(0));
  ok('utm lowercase tip', (await p.innerText('main')).includes('lower case'));
  await p.click('button:has-text("Shorten this URL")'); await p.waitForSelector('main h1:has-text("Short links")');
  const handoff = await p.innerText('main');
  ok('utm -> shorten hands URL to the Links tool (sign-in on a server, explanation on a static host)', process.env.STATIC ? handoff.includes('needs a Hitchly server') : handoff.includes('API token'), handoff.slice(0, 200));

  await go('url-parser'); await p.fill('input[type=url]','https://example.com/x?id=7&utm_source=n&fbclid=1#top'); await p.waitForTimeout(100);
  ok('url cleaned', (await out(0)) === 'https://example.com/x?id=7#top', await out(0));

  await p.fill('#toolSearch','hash'); ok('tool search filters nav', (await p.$$('nav a:not([hidden])')).length === 1);
  // mobile: the tool list is collapsed behind a menu button and opens/closes
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await m.goto(U('base64')); await m.waitForSelector('main h1');
  ok('mobile: tool list is collapsed by default', !(await m.isVisible('nav')));
  await m.click('#menu'); ok('mobile: menu opens the tool list', await m.isVisible('nav') && (await m.getAttribute('#menu', 'aria-expanded')) === 'true');
  await m.click('nav a[data-id=data-formats]'); await m.waitForSelector('main h1:has-text("Data formats")');
  ok('mobile: picking a tool closes the menu', !(await m.isVisible('nav')));
  await m.goto(U('qr')); await m.waitForSelector('main h1');
  ok('qr: no error is shown before the user types', (await m.innerText('main')).includes('Enter some text') === false);

  console.log(`\n${pass} passed, ${fail} failed`);
  // On a static host the server probe (GET health) legitimately 404s; nothing else may log an error.
  if (process.env.STATIC) for (let i = bad.length - 1; i >= 0; i--) if (/404/.test(bad[i])) bad.splice(i, 1);
  console.log('console/CSP errors:', bad);
  await b.close();
  process.exit(fail || bad.length ? 1 : 0);
})();
