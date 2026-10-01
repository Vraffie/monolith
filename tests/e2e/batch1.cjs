// Browser tests for the batch-1 tools (diff, cron, converter, HTTP reference, TOTP, subnet, lorem, chmod, escape, encodings, units, validators, Basic auth, keys, encryption, ULID).
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const U = id => (process.env.BUNDLE ? `${BASE}#/${id}` : `${BASE}/#/${id}`);  // BUNDLE=1: BASE_URL is the file:// bundle
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const p = await (await b.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })).newPage(); const bad = [];
  p.on('pageerror', e => bad.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') bad.push('console: ' + m.text()); });
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + String(extra).slice(0, 300))); };
  const go = async id => { await p.goto(U(id)); await p.waitForSelector('main h1'); await p.waitForTimeout(120); };
  const main = () => p.innerText('main');
  const lab = (text, tag = 'input') => `main label:has-text("${text}") + ${tag}`;
  const out = n => p.locator('.out pre').nth(n).innerText();

  await p.goto(process.env.BUNDLE ? BASE : BASE + '/'); await p.waitForSelector('nav a');
  ok('nav lists 37 tools', (await p.$$('nav a')).length === 37, String((await p.$$('nav a')).length));

  // diff
  await go('diff');
  await p.fill(lab('Original', 'textarea'), 'a\nb\nc'); await p.fill(lab('Changed', 'textarea'), 'a\nx\nc\nd'); await p.waitForTimeout(100);
  ok('diff: stats line', (await main()).includes('+2 added, −1 removed, 2 unchanged'), await main());
  ok('diff: added/removed rows are styled', (await p.$$('table.diff tr.add')).length === 2 && (await p.$$('table.diff tr.del')).length === 1);
  await p.selectOption('main select', 'words'); await p.fill(lab('Original', 'textarea'), 'the quick fox'); await p.fill(lab('Changed', 'textarea'), 'the slow fox'); await p.waitForTimeout(100);
  ok('diff: word mode marks the changed words inline', (await p.innerText('.inline-diff .del')) === 'quick' && (await p.innerText('.inline-diff .add')) === 'slow');
  await p.selectOption('main select', 'json'); await p.fill(lab('Original', 'textarea'), '{"a":1,"b":[1,2]}'); await p.fill(lab('Changed', 'textarea'), '{"b":[1,3],"a":1,"c":true}'); await p.waitForTimeout(100);
  ok('diff: JSON mode ignores key order and lists paths', (await main()).includes('2 differences') && (await main()).includes('$.b[1]') && (await main()).includes('$.c'), await main());
  await p.fill(lab('Changed', 'textarea'), '{bad'); await p.waitForTimeout(100); ok('diff: invalid JSON reported', (await p.innerText('.err')).length > 0);

  // cron
  await go('cron');
  ok('cron: default explained', (await main()).includes('Monday through Friday'), await main());
  ok('cron: five next runs', (await p.$$('main ol li')).length === 5);
  await p.fill(lab('Expression'), '61 * * * *'); await p.waitForTimeout(100); ok('cron: invalid expression error', (await p.innerText('.err')).includes('minute must be'));
  await p.click('button:has-text("Weekdays at 09:00")'); await p.waitForTimeout(100); ok('cron: preset fills the box', (await main()).includes('At 09:00, on Monday through Friday'));

  // converter
  await go('convert');
  await p.fill(lab('Input', 'textarea'), '{"name":"Ann","tags":["a","b"]}'); await p.selectOption(lab('From', 'select'), 'json'); await p.selectOption(lab('To', 'select'), 'yaml'); await p.waitForTimeout(100);
  ok('convert: JSON to YAML', (await out(0)) === 'name: Ann\ntags:\n  - a\n  - b\n', await out(0));
  await p.click('button:has-text("Swap")'); await p.waitForTimeout(100); ok('convert: swap converts back to JSON', (await out(0)).includes('"name": "Ann"'), await out(0));
  await p.selectOption(lab('From', 'select'), 'yaml'); await p.fill(lab('Input', 'textarea'), 'a: &x 1'); await p.waitForTimeout(100); ok('convert: unsupported YAML is refused', (await p.innerText('.err')).includes('anchors'));

  // HTTP reference
  await go('http');
  await p.fill('main input[type=search]', '404'); await p.waitForTimeout(100); ok('http: status 404 found', (await main()).includes('Not Found'));
  await p.fill('main input[type=search]', 'teapot'); await p.waitForTimeout(100); ok('http: search by text', (await main()).includes('418'));
  await p.selectOption('main select', 'mime'); await p.fill('main input[type=search]', 'png'); await p.waitForTimeout(100); ok('http: MIME lookup', (await main()).includes('image/png'));

  // TOTP
  await go('totp');
  await p.fill(lab('Secret (Base32)'), 'JBSWY3DPEHPK3PXP'); await p.waitForTimeout(400);
  const code = (await p.innerText('.big-code')).replace(/\s/g, '');
  ok('totp: shows a 6-digit code', /^\d{6}$/.test(code), code);
  ok('totp: shows a QR code', await p.isVisible('img[alt^="QR code for the authenticator"]'));
  ok('totp: provisioning URI', (await main()).includes('otpauth://totp/Example:alice%40example.com?secret=JBSWY3DPEHPK3PXP'), await main());
  await p.fill('main input[aria-label="Code to check"]', code); await p.waitForTimeout(500); ok('totp: the displayed code verifies', (await main()).includes('✓ Matches'), await main());
  await p.fill('main input[aria-label="Code to check"]', '000000'); await p.waitForTimeout(500); ok('totp: a wrong code is rejected', (await main()).includes('✗ Does not match'));
  await p.fill(lab('Secret (Base32)'), '!!!'); await p.waitForTimeout(300); ok('totp: bad secret explained', (await p.innerText('.err')).includes('Base32'));
  await p.click('button:has-text("Generate a new secret")'); await p.waitForTimeout(300); ok('totp: new secret works', /^\d{3} \d{3}$/.test(await p.innerText('.big-code')));

  // subnet
  await go('subnet');
  ok('subnet: network and usable hosts', (await main()).includes('192.168.1.128/26') && (await main()).includes('62'), await main());
  await p.fill(lab('Address / prefix (IPv4 or IPv6)'), '2001:db8::1/64'); await p.waitForTimeout(100); ok('subnet: IPv6', (await main()).includes('2001:db8::/64') && (await main()).includes('18 446 744 073 709 551 616'), await main());
  await p.selectOption('main select', 'range'); await p.waitForTimeout(100); ok('subnet: range to CIDR', (await main()).includes('192.168.0.8/29') && (await main()).includes('5 blocks'), await main());
  await p.fill(lab('First address'), '10.0.0.9'); await p.fill(lab('Last address'), '10.0.0.1'); await p.waitForTimeout(100); ok('subnet: reversed range explained', (await p.innerText('.err')).includes('after the end'));

  // lorem
  await go('lorem'); ok('lorem: starts with the classic text', (await out(0)).startsWith('Lorem ipsum dolor sit amet'));
  ok('lorem: three paragraphs', (await out(0)).split('\n\n').length === 3);
  await p.selectOption('main select', 'words'); await p.fill(lab('How many'), '7'); await p.waitForTimeout(100); ok('lorem: seven words', (await out(0)).split(' ').length === 7);

  // chmod
  await go('chmod');
  ok('chmod: default 644', (await p.inputValue(lab('Octal'))) === '644' && (await p.inputValue(lab('Symbolic'))) === 'rw-r--r--');
  await p.fill(lab('Octal'), '4755'); await p.waitForTimeout(100); ok('chmod: octal updates symbolic and checkboxes', (await p.inputValue(lab('Symbolic'))) === 'rwsr-xr-x' && await p.isChecked('main .checks input >> nth=2'), await p.inputValue(lab('Symbolic')));
  await p.fill(lab('Symbolic'), 'rwxrwxrwt'); await p.waitForTimeout(100); ok('chmod: symbolic updates octal', (await p.inputValue(lab('Octal'))) === '1777');
  await p.fill(lab('Octal'), '999'); await p.waitForTimeout(100); ok('chmod: bad octal explained', (await p.innerText('.err')).includes('octal'));
  ok('chmod: shows the command', (await main()).includes('chmod 1777 file'));

  // escape
  await go('escape');
  await p.fill(lab('Input', 'textarea'), '<b class="x">Tom & Jerry</b>'); await p.waitForTimeout(100); ok('escape: HTML encode', (await out(0)) === '&lt;b class=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/b&gt;', await out(0));
  await p.selectOption(lab('Direction', 'select'), 'dec'); await p.fill(lab('Input', 'textarea'), '&lt;i&gt; &amp; &#65;'); await p.waitForTimeout(100); ok('escape: HTML decode', (await out(0)) === '<i> & A');
  await p.selectOption(lab('Format', 'select'), 'json'); await p.selectOption(lab('Direction', 'select'), 'enc'); await p.fill(lab('Input', 'textarea'), 'line\n"q"'); await p.waitForTimeout(100); ok('escape: JSON string', (await out(0)) === 'line\\n\\"q\\"', await out(0));

  // text encodings
  await go('textenc');
  await p.fill(lab('Input', 'textarea'), 'Hi'); await p.waitForTimeout(100); ok('textenc: Hi in hex', (await out(0)) === '48 69');
  await p.selectOption(lab('Number base', 'select'), '2'); await p.waitForTimeout(100); ok('textenc: binary', (await out(0)) === '01001000 01101001');
  await p.selectOption(lab('Mode', 'select'), 'cp'); await p.fill(lab('Input', 'textarea'), 'a😀'); await p.waitForTimeout(100); ok('textenc: code points', (await main()).includes('U+1F600') && (await main()).includes('f0 9f 98 80'));
  await p.selectOption(lab('Mode', 'select'), 'nato'); await p.fill(lab('Input', 'textarea'), 'Abc 1'); await p.waitForTimeout(100); ok('textenc: NATO', (await out(0)) === 'Alfa Bravo Charlie / One', await out(0));
  await p.selectOption(lab('Mode', 'select'), 'text'); await p.selectOption(lab('Number base', 'select'), '16'); await p.fill(lab('Input', 'textarea'), '48 65 6c 6c 6f'); await p.waitForTimeout(100); ok('textenc: bytes to text', (await out(0)) === 'Hello');

  // units
  await go('units');
  ok('units: 1994 in Roman numerals', (await out(0)) === 'MCMXCIV', await out(0));
  await p.fill(lab('Number (1-3999) or Roman numeral'), 'MMXXVI'); await p.waitForTimeout(100); ok('units: Roman numeral to number', (await out(0)) === '2026');
  await p.fill(lab('Number (1-3999) or Roman numeral'), 'IIII'); await p.waitForTimeout(100); ok('units: non-canonical Roman rejected', (await p.innerText('.err')).includes('canonical'));
  await p.selectOption(lab('Converter', 'select'), 'temperature'); await p.fill(lab('Value'), '100'); await p.selectOption(lab('From', 'select'), 'C'); await p.selectOption(lab('To', 'select'), 'F'); await p.waitForTimeout(100); ok('units: 100 C is 212 F', (await out(0)) === '212 F', await out(0));
  await p.selectOption(lab('Converter', 'select'), 'data'); await p.fill(lab('Value'), '1'); await p.selectOption(lab('From', 'select'), 'GiB'); await p.selectOption(lab('To', 'select'), 'MB'); await p.waitForTimeout(100); ok('units: 1 GiB in MB', (await out(0)) === '1073.741824 MB', await out(0));
  await p.selectOption(lab('Converter', 'select'), 'percent'); await p.waitForTimeout(100); ok('units: 15% of 200', (await out(0)) === '30', await out(0));

  // validators
  await go('validate');
  ok('validate: sample IBAN is valid', (await main()).includes('Valid') && !(await main()).includes('Not valid'), await main());
  await p.fill(lab('Value'), 'GB82 WEST 1234 5698 7654 33'); await p.waitForTimeout(100); ok('validate: one wrong digit detected', (await main()).includes('Not valid') && (await main()).includes('check digits'));
  await p.selectOption(lab('Check', 'select'), 'email'); await p.waitForTimeout(100); ok('validate: email normalised', (await main()).includes('johndoe@gmail.com'), await main());

  // basic auth
  await go('basicauth'); ok('basicauth: RFC 7617 example', (await out(0)).includes('Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=='));
  await p.selectOption(lab('Mode', 'select'), 'parse'); await p.fill(lab('Header'), 'Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ=='); await p.waitForTimeout(100); ok('basicauth: decodes', (await out(0)).includes('user: Aladdin') && (await out(0)).includes('password: open sesame'), await out(0));

  // keys
  await go('keys'); await p.click('button:has-text("Generate")'); await p.waitForSelector('text=Public key', { timeout: 10000 }); await p.waitForTimeout(200);
  ok('keys: PEM public and private keys', (await out(0)).startsWith('-----BEGIN PUBLIC KEY-----') && (await out(1)).startsWith('-----BEGIN PRIVATE KEY-----'));
  ok('keys: fingerprint', /^([0-9a-f]{2}:){31}[0-9a-f]{2}$/.test(await out(2)), await out(2));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('main button:has-text("Download") >> nth=0')]); ok('keys: download offered', dl.suggestedFilename().endsWith('public.pem'), dl.suggestedFilename());

  // encryption round trip through the UI
  await go('encrypt');
  await p.fill(lab('Input', 'textarea'), 'Hemmelig ✓'); await p.fill(lab('Passphrase'), 'correct horse'); await p.selectOption(lab('PBKDF2 iterations', 'select'), '100000');
  await p.click('button:has-text("Run")'); await p.waitForFunction(() => /^hx1\./.test(document.querySelector('.out pre').textContent), null, { timeout: 15000 });
  const token = await out(0); ok('encrypt: produces an hx1 token', /^hx1\.100000\./.test(token), token);
  await p.selectOption(lab('Mode', 'select'), 'dec'); await p.fill(lab('Input', 'textarea'), token); await p.fill(lab('Passphrase'), 'wrong'); await p.click('button:has-text("Run")');
  await p.waitForFunction(() => document.querySelector('.err').textContent.length > 0, null, { timeout: 15000 }); ok('encrypt: wrong passphrase refused', (await p.innerText('.err')).includes('Wrong passphrase'));
  await p.fill(lab('Passphrase'), 'correct horse'); await p.click('button:has-text("Run")'); await p.waitForFunction(() => document.querySelector('.out pre').textContent === 'Hemmelig ✓', null, { timeout: 15000 });
  ok('encrypt: decrypts with the right passphrase', true);

  // ULID
  await go('uuid'); await p.selectOption('main select', 'ulid'); await p.click('button:has-text("Generate")'); await p.waitForTimeout(100);
  ok('uuid: ULID option', /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test((await out(0)).split('\n')[0]), await out(0));
  await p.fill(lab('Inspect'), '01ARYZ6S410000000000000000'); await p.waitForTimeout(100); ok('uuid: inspects a ULID', (await main()).includes('Valid ULID, created 2016-07-30T22:36:16.385Z'), await main());

  console.log(`\n${pass} passed, ${fail} failed`); console.log('console/CSP errors:', bad);
  await b.close(); process.exit(fail || bad.length ? 1 : 0);
})();
