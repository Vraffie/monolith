// Browser tests for the image tools. Decoded results are verified by the browser itself (<img>.naturalWidth, canvas pixels).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const U = id => (process.env.BUNDLE ? `${BASE}#/${id}` : `${BASE}/#/${id}`);
const FX = path.join(__dirname, '..', 'js', 'fixtures');
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const ctx = await b.newContext({ acceptDownloads: true }), p = await ctx.newPage(), bad = [];
  p.on('pageerror', e => bad.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') bad.push('console: ' + m.text()); });
  p.on('request', r => { if (!/^(data|blob|file):/.test(r.url()) && !r.url().startsWith(BASE.replace(/\/$/, ''))) bad.push('remote request: ' + r.url()); });
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(extra).slice(0, 300))); };
  const go = async id => { await p.goto(U(id)); await p.waitForSelector('main h1'); await p.waitForTimeout(120); };
  const main = () => p.innerText('main');
  const download = async sel => { const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]); const f = await d.path(); return { name: d.suggestedFilename(), bytes: fs.readFileSync(f) }; };
  // decode bytes in the page: returns [w, h]
  const decode = bytes => p.evaluate(async b64 => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const bm = await createImageBitmap(new Blob([bin])); return [bm.width, bm.height]; }, Buffer.from(bytes).toString('base64'));

  // --- photo privacy cleaner
  await go('image-privacy');
  await p.setInputFiles('main input[type=file]', path.join(FX, 'photo-gps.jpg')); await p.waitForSelector('main table.kv');
  let t = await main();
  ok('privacy: shows camera, GPS and orientation', t.includes('ACME') && t.includes('Cam 9') && t.includes('59.9139') && t.includes('10.7522') && t.includes('Orientation'), t);
  ok('privacy: lists what will be removed', /EXIF/.test(t) && /Will be removed/.test(t));
  const clean = await download('main button.primary');
  ok('privacy: download is named -clean.jpg', clean.name === 'photo-gps-clean.jpg', clean.name);
  const orig = fs.readFileSync(path.join(FX, 'photo-gps.jpg'));
  ok('privacy: cleaned file is smaller and has no camera or XMP data', clean.bytes.length < orig.length && !clean.bytes.includes(Buffer.from('ACME')) && !clean.bytes.includes(Buffer.from('http://ns.adobe.com/xap')));
  const [cw, ch] = await decode(clean.bytes), [ow, oh] = await decode(orig);
  ok('privacy: cleaned photo decodes and keeps its rotation (same displayed size)', cw === ow && ch === oh && cw > 0, `${cw}x${ch} vs ${ow}x${oh}`);
  await p.setInputFiles('main input[type=file]', path.join(FX, 'plain.jpg')); await p.waitForTimeout(250);
  ok('privacy: clean photo reports nothing to remove', (await main()).includes('Nothing to remove'));
  await p.setInputFiles('main input[type=file]', { name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') }); await p.waitForTimeout(250);
  ok('privacy: garbage is rejected with a message', (await p.innerText('main .err')).length > 0);
  await p.setInputFiles('main input[type=file]', path.join(FX, 'meta.png')); await p.waitForTimeout(250);
  const png = await download('main button.primary'); const [pw] = await decode(png.bytes);
  ok('privacy: PNG cleaned and still decodes', pw > 0 && !png.bytes.includes(Buffer.from('tEXt')) && !png.bytes.includes(Buffer.from('iTXt')));
  await p.setInputFiles('main input[type=file]', path.join(FX, 'meta.webp')); await p.waitForTimeout(250);
  const webp = await download('main button.primary'); const [ww] = await decode(webp.bytes);
  ok('privacy: WebP cleaned and still decodes', ww > 0 && !webp.bytes.includes(Buffer.from('EXIF')) && !webp.bytes.includes(Buffer.from('XMP ')));

  // --- converter
  await go('image-convert');
  await p.setInputFiles('main input[type=file]', path.join(FX, 'photo-gps.jpg')); await p.waitForSelector('main img.preview:not([hidden])');
  const w0 = +(await p.inputValue('main input[aria-label="Width in pixels"]')), h0 = +(await p.inputValue('main input[aria-label="Height in pixels"]'));
  ok('convert: width/height prefilled', w0 > 0 && h0 > 0, `${w0}x${h0}`);
  await p.selectOption('main select', 'image/png'); await p.waitForTimeout(400);
  const pngOut = await download('main button.primary');
  ok('convert: JPEG → PNG has PNG signature and .png name', pngOut.bytes.subarray(1, 4).toString() === 'PNG' && pngOut.name === 'photo-gps.png', pngOut.name);
  await p.fill('main input[aria-label="Width in pixels"]', '20'); await p.waitForTimeout(500);
  ok('convert: aspect ratio kept', +(await p.inputValue('main input[aria-label="Height in pixels"]')) === Math.round(20 / (w0 / h0)));
  const small = await download('main button.primary'); const [sw] = await decode(small.bytes);
  ok('convert: resized output decodes at 20px wide', sw === 20, String(sw));
  await p.selectOption('main select', 'image/webp'); await p.waitForTimeout(400);
  const wp = await download('main button.primary');
  ok('convert: WebP output', wp.bytes.subarray(0, 4).toString() === 'RIFF' && wp.bytes.subarray(8, 12).toString() === 'WEBP');
  await p.fill('main input[aria-label="Width in pixels"]', '0'); await p.waitForTimeout(500);
  ok('convert: invalid size reported', (await p.innerText('main .err')).length > 0);

  // --- favicon generator
  await go('favicon');
  await p.setInputFiles('main input[type=file]', path.join(FX, 'plain.jpg')); await p.waitForSelector('main .preview');
  ok('favicon: shows six previews', (await p.$$('main img.preview')).length === 6);
  const zipd = await download('main button.primary');
  const zdir = fs.mkdtempSync('/tmp/fav-'); fs.writeFileSync(path.join(zdir, 'f.zip'), zipd.bytes);
  const names = require('child_process').execFileSync('python3', ['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(",".join(sorted(z.namelist())))', path.join(zdir, 'f.zip')]).toString().trim();
  ok('favicon: ZIP is valid and complete', names === 'apple-touch-icon.png,favicon-16.png,favicon-32.png,favicon-48.png,favicon.ico,head.html,icon-192.png,icon-512.png,site.webmanifest', names);
  const sizes = require('child_process').execFileSync('python3', ['-c', 'import zipfile,sys,io;z=zipfile.ZipFile(sys.argv[1]);b=z.read("favicon.ico");print(b[4], z.read("icon-512.png")[16:24].hex())', path.join(zdir, 'f.zip')]).toString().trim();
  ok('favicon: ICO has 3 images; 512 PNG is 512x512', sizes === '3 0000020000000200', sizes);

  // --- colour-blindness
  await go('colour-blindness');
  await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 8; c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 8, 8); window.__png = c.toDataURL(); });
  const redPng = await p.evaluate(() => window.__png.split(',')[1]);
  await p.setInputFiles('main input[type=file]', { name: 'red.png', mimeType: 'image/png', buffer: Buffer.from(redPng, 'base64') }); await p.waitForTimeout(300);
  const px = async i => p.evaluate(i => [...document.querySelectorAll('main canvas')][i].getContext('2d').getImageData(1, 1, 1, 1).data.join(','), 0);
  const after = idx => p.evaluate(i => [...document.querySelectorAll('main canvas')][i].getContext('2d').getImageData(1, 1, 1, 1).data.join(','), idx);
  ok('colourblind: original keeps pure red', (await after(0)) === '255,0,0,255', await after(0));
  const prot = await after(1); ok('colourblind: protanopia changes red to a dark olive', prot !== '255,0,0,255' && +prot.split(',')[0] < 120, prot);
  await p.selectOption('main select', 'achromatopsia'); await p.waitForTimeout(200);
  const [r, g, bb] = (await after(1)).split(',').map(Number); ok('colourblind: achromatopsia is grey', r === g && g === bb && r > 0, `${r},${g},${bb}`);
  void px;

  // --- data URI
  await go('data-uri');
  await p.setInputFiles('main input[type=file]', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('héllo') });
  await p.waitForFunction(() => document.querySelector('.out pre').textContent.startsWith('data:'));
  ok('data-uri: encodes a file', (await p.innerText('.out pre')) === 'data:text/plain;base64,' + Buffer.from('héllo').toString('base64'));
  await p.fill('main textarea', 'data:image/png;base64,' + redPng); await p.waitForTimeout(200);
  ok('data-uri: decoding an image shows a preview', await p.evaluate(() => { const i = document.querySelector('main img.preview'); return !i.hidden && i.naturalWidth === 8; }));
  const dl = await download('main button:has-text("Download decoded")');
  ok('data-uri: decoded download is the PNG', dl.name === 'data.png' && dl.bytes.subarray(1, 4).toString() === 'PNG', dl.name);
  await p.fill('main textarea', 'data:image/png;base64,@@@'); await p.waitForTimeout(200);
  ok('data-uri: damaged data reported', (await p.innerText('main .err >> nth=1')).length > 0);

  ok('no page errors, console errors or remote requests', bad.length === 0, bad.join(' | '));
  console.log(`images: ${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
