// End-to-end browser test. Needs: npm i playwright && npx playwright install chromium
// Usage: BASE_URL=http://127.0.0.1:8080 HITCHLY_TOKEN=... node tests/e2e/<file>.cjs   (exit code 1 on failure)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args:['--no-sandbox'] });
  const p = await b.newPage(); const bad=[];
  p.on('pageerror', e=>bad.push('pageerror: '+e.message));
  p.on('console', m=>{ if (m.type()==='error') bad.push('console: '+m.text()); });
  await p.goto((process.env.BASE_URL || 'http://127.0.0.1:8080') + '/');
  console.log('1 gate shows login:', await p.isVisible('input[type=password]'), '| title:', await p.title());
  await p.fill('#tok', process.env.HITCHLY_TOKEN || 'smoke'); await p.click('form.card button');
  await p.waitForSelector('text=Shorten');
  await p.fill('input[type=url]','https://example.com/one');
  await p.locator('label:has-text("Custom slug") + input').fill('shell1');
  await p.locator('label:has-text("Tags") + input').fill('docs, launch');
  await p.click('button:has-text("Shorten")');
  await p.waitForSelector('a.short >> text=shell1');
  await p.fill('input[type=search][aria-label="Search links"]','#launch'); await p.waitForTimeout(500);
  console.log('2 tag search rows:', (await p.$$('.link')).length);
  await p.click('button:has-text("QR")'); await p.waitForSelector('img[alt^="QR"]');
  console.log('3 qr shown:', await p.isVisible('img[alt^="QR"]'));
  await p.click('button:has-text("Stats")'); await p.waitForSelector('text=visits');
  const answers=['https://example.com/two','2']; p.on('dialog', d=>d.accept(answers.shift()??''));
  await p.click('button:has-text("Edit")'); await p.waitForSelector('text=https://example.com/two');
  console.log('4 edited ok');
  await p.fill('#toolSearch','zzz'); console.log('5 nav filter hides links:', await p.isHidden('nav a[data-id=short-links]'));
  await p.fill('#toolSearch',''); 
  await p.click('#auth'); console.log('6 signed out button now:', await p.innerText('#auth'));
  console.log('violations/errors:', bad); await b.close();
  process.exit(bad.length ? 1 : 0);
})();
