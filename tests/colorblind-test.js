// Color assist (colorblind mode) + accessibility themes: node tests/colorblind-test.js
// Covers the COLOR ASSIST switch (move dots green -> blue, capture squares stay
// red, check flash high-contrast), the always-unlocked CONTRAST board and MONO
// piece set, and that all of it persists across reloads.
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  const errs = []; let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(x))); };
  const url = 'file://' + __dirname + '/../chess/index.html';
  const ctx = await br.newContext({ viewport: { width: 390, height: 780 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url); await pg.waitForTimeout(400);
  await pg.evaluate(() => { fx = false; snd = false; });

  // logical board pixel (draw() scales the 160px canvas by 4 with HD pieces on)
  const cvPx = (x, y) => pg.evaluate(([x, y]) => {
    const S = (prof && prof.hd !== false) ? 4 : 1;
    return '#' + [...cv.getContext('2d').getImageData(x * S, y * S, 1, 1).data].slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
  }, [x, y]);
  const bgPx = (x, y) => pg.evaluate(([x, y]) => '#' + [...bg.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join(''), [x, y]);
  const countPx = (x0, y0, w0, h0, hex) => pg.evaluate(([x0, y0, w0, h0, hex]) => {
    const S = (prof && prof.hd !== false) ? 4 : 1, d = cv.getContext('2d').getImageData(x0 * S, y0 * S, w0 * S, h0 * S).data;
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b) n++;
    return n;
  }, [x0, y0, w0, h0, hex]);
  const start = async () => { await pg.click('[data-m="1"]'); await pg.locator('.oc.cur').click(); await pg.waitForTimeout(150); };
  const dotAt = async (fr, fc, tr, tc) => { await pg.evaluate(([fr, fc]) => { sel = [fr, fc]; moves = legal(b, fr, fc); draw(); }, [fr, fc]); return cvPx(tc * 20 + 10, tr * 20 + 9); };
  const capture = async () => {
    await pg.evaluate(() => {
      const e = Array.from({ length: 8 }, () => Array(8).fill(null));
      e[4][4] = 'wP'; e[3][3] = 'bN'; e[7][7] = 'wK'; e[0][0] = 'bK';
      e.cr = { wK: 0, wQ: 0, bK: 0, bQ: 0 }; e.ep = null;
      b = e; turn = 'w'; hist = []; sel = [4, 4]; moves = legal(b, 4, 4); draw();
    });
    return countPx(60, 60, 20, 20, '#e8433a');
  };

  // default: green move dots, red capture squares
  await start();
  ok('fresh profile: color assist is off', await pg.evaluate(() => prof.cb === 0));
  const g1 = await dotAt(6, 4, 5, 4);
  ok('move dots are green by default', g1 === '#2fbf6a', g1);
  const r1 = await capture();
  ok('capture squares are red by default', r1 > 0, r1);

  // the switch lives in settings and saves
  await pg.evaluate(() => toTitle());
  await pg.click('#stg');
  ok('COLOR ASSIST carries switch semantics', await pg.locator('#swCb').count() === 1 && await pg.locator('#swCb').getAttribute('role') === 'switch');
  await pg.click('#swCb');
  ok('switch turns on, shows and saves', await pg.evaluate(() => prof.cb === 1 &&
    document.getElementById('swCb').classList.contains('on') &&
    document.getElementById('swCb').getAttribute('aria-checked') === 'true' &&
    JSON.parse(localStorage.getItem('pixelchess.v1')).cb === 1));
  await pg.click('#setBack');

  // assist: blue move dots, captures keep the red square
  await start();
  const b1 = await dotAt(6, 4, 5, 4);
  ok('assist move dots are blue', b1 === '#2b6be0', b1);
  const r2 = await capture();
  ok('capture squares stay red under assist', r2 === r1 && r2 > 0, [r1, r2]);

  // persistence
  await pg.evaluate(() => toTitle());
  await pg.reload(); await pg.waitForTimeout(300);
  await pg.evaluate(() => { fx = false; snd = false; });
  ok('assist survives a reload', await pg.evaluate(() => prof.cb === 1 && document.getElementById('swCb').classList.contains('on')));

  // help documents it
  await pg.click('#hp');
  ok('help explains color assist', /COLOR ASSIST/.test(await pg.locator('#s-help').innerText()));
  await pg.click('#hb');

  // always-unlocked accessibility themes
  await pg.click('#th');
  ok('CONTRAST board and MONO pieces are always unlocked', (await pg.locator('#tb .tc').nth(5).getAttribute('aria-disabled')) === 'false' && /CONTRAST/.test(await pg.locator('#tb .tc').nth(5).innerText()) && (await pg.locator('#tp .tc').nth(4).getAttribute('aria-disabled')) === 'false' && /MONO/.test(await pg.locator('#tp .tc').nth(4).innerText()));
  await pg.locator('#tb .tc').nth(5).click();
  ok('CONTRAST board saves', await pg.evaluate(() => prof.theme.board === 'contrast'));
  await pg.locator('#tp .tc').nth(4).click();
  ok('MONO pieces save a high-contrast palette', await pg.evaluate(() => prof.theme.piece === 'mono' && PAL.b.o === '#e8e8f0' && PAL.w.o === '#101014'));
  await pg.click('#thb');
  await start();
  ok('contrast board draws near-black squares', (await bgPx(30, 10)) === '#23252f', await bgPx(30, 10));
  ok('mono pieces draw their light outline', await pg.evaluate(() => runs('bK').some(r => String(r[3]).toLowerCase() === '#e8e8f0')));
  await dotAt(6, 4, 5, 4);
  await pg.screenshot({ path: 'colorblind-board.png' });
  await pg.reload(); await pg.waitForTimeout(300);
  ok('accessibility themes survive a reload', await pg.evaluate(() => prof.cb === 1 && prof.theme.board === 'contrast' && prof.theme.piece === 'mono'));

  // ...and the switch turns back off
  await pg.click('#stg');
  await pg.click('#swCb');
  ok('switch turns assist back off', await pg.evaluate(() => prof.cb === 0));
  await pg.click('#setBack');
  await start();
  const g2 = await dotAt(6, 4, 5, 4);
  ok('move dots return to green', g2 === '#2fbf6a', g2);

  await pg.context().close();
  await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})();
