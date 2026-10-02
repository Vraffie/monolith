// Browser tests: play every game through the real UI. Serve site/ first: python3 -m http.server 8090 -d site
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8090';
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const ctx = await b.newContext({ permissions: ['clipboard-read', 'clipboard-write'] }), p = await ctx.newPage(), bad = [];
  p.on('pageerror', e => bad.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') bad.push('console: ' + m.text()); });
  p.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) bad.push('remote request: ' + r.url()); });
  let pass = 0, fail = 0;
  const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  -> ' + String(x).slice(0, 250))); };
  const go = async h => { await p.goto(`${BASE}/#/${h}`); await p.waitForSelector('main h1'); await p.waitForLoadState('networkidle'); };

  await p.goto(BASE + '/'); await p.waitForSelector('a.game');
  ok('home lists three games', (await p.$$('a.game')).length === 3);

  // ---- Nearest (archive puzzle n=5 so the secret is the same every run; read it from the game's own modules)
  await go('nearest?n=5'); await p.waitForSelector('input[aria-label="Your guess"]');
  const secret = await p.evaluate(async () => { const d = await import('./lib/data.js'), { pick } = await import('./lib/daily.js'); const s = await d.loadSecrets(); return s[pick(s.length, 5, 101)]; });
  const guess = async w => { await p.fill('input[aria-label="Your guess"]', w); await p.press('input[aria-label="Your guess"]', 'Enter'); await p.waitForTimeout(80); };
  await guess('zzzzqq'); ok('nearest: unknown word explained', /not in the word list/.test(await p.innerText('.msg')));
  await guess('piano'); await guess('river');
  ok('nearest: guesses are listed with ranks', (await p.$$('.guess')).length === 2 && /^\d/.test(await p.innerText('.guess .r')));
  await guess('piano'); ok('nearest: repeat guess is not added twice', (await p.$$('.guess')).length === 2 && /already tried/.test(await p.innerText('.msg')));
  const before = (await p.$$('.guess')).length; await p.click('button:has-text("Hint")'); await p.waitForTimeout(100);
  ok('nearest: hint adds a closer word', (await p.$$('.guess')).length === before + 1);
  await guess(secret); await p.waitForSelector('.summary .answer');
  ok('nearest: guessing the secret ends the game', (await p.innerText('.summary .answer')) === secret && (await p.$('input[aria-label="Your guess"]:disabled')) !== null);
  await p.reload(); await p.waitForSelector('.summary .answer');
  ok('nearest: progress survives a reload', (await p.$$('.guess')).length >= 4);
  await p.click('button:has-text("Share")'); await p.waitForTimeout(150);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok('nearest: share text', clip.startsWith('Nearest #5 solved in') && /🟩|🟨|🟥/.test(clip), clip);
  await go('nearest?n=6'); await p.waitForSelector('input[aria-label="Your guess"]'); await p.click('button:has-text("Give up")');
  ok('nearest: give up reveals the word and neighbours', (await p.innerText('.summary')).includes('Closest words'));

  // ---- Fours
  await go('fours?n=3'); await p.waitForSelector('.tile');
  const puzzle = await p.evaluate(async () => { const d = await import('./lib/data.js'), { pick } = await import('./lib/daily.js'); const f = await d.loadFours(); return f[pick(f.length, 3, 202)]; });
  ok('fours: 16 tiles', (await p.$$('.tile')).length === 16);
  const tile = w => p.locator('.tile', { hasText: new RegExp('^' + w + '$', 'i') });
  const pickWords = async ws => { for (const w of ws) await tile(w).click(); };
  const g = puzzle.groups;
  await pickWords([...g[0].words.slice(0, 3), g[1].words[0]]); await p.click('button:has-text("Submit")');
  ok('fours: three of four is "One away" and costs a mistake', (await p.innerText('.msg')) === 'One away!' && /3 mistakes left/.test(await p.innerText('.dots')));
  await pickWords([g[0].words[0], g[1].words[0], g[2].words[0], g[3].words[0]]); ok('fours: submit enabled with four selected', await p.isEnabled('button:has-text("Submit")'));
  await p.click('button:has-text("Deselect all")'); ok('fours: deselect clears', (await p.$$('.tile.on')).length === 0);
  for (const grp of g) { await pickWords(grp.words); await p.click('button:has-text("Submit")'); await p.waitForTimeout(60); }
  await p.waitForSelector('.summary h2');
  ok('fours: solving all four groups wins', (await p.innerText('.summary h2')) === 'Solved!' && (await p.$$('.group')).length === 4);
  await p.click('.summary button:has-text("Share")'); await p.waitForTimeout(150);
  const fc = await p.evaluate(() => navigator.clipboard.readText()); ok('fours: share has an emoji grid', /^Fours #3 solved \(1 mistake\)\n[🟨🟩🟦🟪]{4}/u.test(fc), fc);
  await go('fours?n=4'); await p.waitForSelector('.tile');
  const p4 = await p.evaluate(async () => { const d = await import('./lib/data.js'), { pick } = await import('./lib/daily.js'); const f = await d.loadFours(); return f[pick(f.length, 4, 202)]; });
  for (let i = 0; i < 4; i++) { await pickWords([p4.groups[0].words[0], p4.groups[1].words[0], p4.groups[2].words[0], p4.groups[3].words[0]]); await p.click('button:has-text("Submit")'); await p.waitForTimeout(60); }
  ok('fours: four mistakes lose and reveal all groups', (await p.innerText('.summary h2')) === 'Out of mistakes' && (await p.$$('.group')).length === 4);

  // ---- Bridge
  await go('bridge?n=2'); await p.waitForSelector('input[aria-label="Your word"]');
  const answers = await p.evaluate(async () => { const d = await import('./lib/data.js'), { pick } = await import('./lib/daily.js'); const br = await d.loadBridges(); const used = { two: 0, three: 0, one: 0 }, salt = { two: 303, three: 304, one: 305 };
    return ['two', 'three', 'one', 'two', 'one'].map(k => { const n = used[k]++, pz = br[k][pick(br[k].length, 1 * 2 + n + 1, salt[k])]; return pz; }); });
  ok('bridge: round 1 shows two clues', (await p.$$('.clues .chip')).length === 2);
  const clueWord = answers[0].clues[0];
  await p.fill('input[aria-label="Your word"]', clueWord); await p.press('input[aria-label="Your word"]', 'Enter');
  ok('bridge: a clue word is refused', /part of the clue/.test(await p.innerText('.msg')) && (await p.$$('section.card')).length === 1);
  for (let r = 0; r < 5; r++) {
    await p.fill('input[aria-label="Your word"]', answers[r].answer); await p.press('input[aria-label="Your word"]', 'Enter'); await p.waitForTimeout(150);
  }
  await p.waitForSelector('.summary h2');
  const total = await p.innerText('.summary h2'); ok('bridge: five rounds give a total out of 5000', /^\d+ \/ 5000$/.test(total) && parseInt(total) > 2500, total);
  ok('bridge: chains are drawn per clue', (await p.$$('.chain')).length === 2 + 3 + 1 + 2 + 1);
  await p.reload(); await p.waitForSelector('.summary h2'); ok('bridge: result survives a reload', (await p.innerText('.summary h2')) === total);
  await p.goto(BASE + '/'); await p.waitForSelector('a.game');
  ok('home shows played stats only for daily games, archive does not count', (await p.innerText('main')).includes('Not played yet'));

  // ---- mobile layout
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  for (const h of ['', 'nearest', 'fours', 'bridge']) { await m.goto(`${BASE}/#/${h}`); await m.waitForSelector('main h1'); await m.waitForLoadState('networkidle'); await m.waitForTimeout(400); const o = await m.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(`mobile: no horizontal scroll on /${h}`, o[0] <= o[1] + 1, o.join('>')); }
  ok('no page errors, console errors or remote requests', bad.length === 0, bad.join(' | '));
  console.log(`games: ${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
