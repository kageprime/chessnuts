// Time control checks: node tests/blitz-test.js
// blitzCycle walk (bullet, bases, increments), label text, Fischer increment on
// each move, snapshot save/restore of the control, and flag fall.
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  const errs = []; let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(x))); };
  const url = 'file://' + __dirname + '/../chess/index.html';
  const ctx = await br.newContext({ viewport: { width: 390, height: 780 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url);
  await pg.waitForTimeout(400);
  await pg.evaluate(() => { fx = false; snd = false; });

  // ---- cycle walks bullet -> bases -> increments -> off --------------------
  const seq = await pg.evaluate(() => {
    blitz = 0; blitzInc = 0; const out = [];
    for (let i = 0; i < 6; i++) { blitzCycle(); out.push(document.getElementById('bz').textContent); }
    return out;
  });
  ok('blitz cycle walks 1 / 3 / 5 / 3+2 / 5+3 / off', JSON.stringify(seq) ===
    JSON.stringify(['BLITZ: 1 MIN', 'BLITZ: 3 MIN', 'BLITZ: 5 MIN', 'BLITZ: 3+2 MIN', 'BLITZ: 5+3 MIN', 'BLITZ: OFF']), seq);

  // ---- bullet: both clocks start at 1:00, no increment ---------------------
  const t0 = await pg.evaluate(() => { blitz = 1; blitzInc = 0; startGame(2); return { w: CLK.w, b: CLK.b, mw: document.getElementById('mw').textContent }; });
  ok('bullet starts both clocks at 1:00', t0.w === 60000 && t0.b === 60000 && t0.mw === '1:00', t0);
  const mv = await pg.evaluate(([from, to]) => {
    const rc = c => [8 - (+c[1]), 'abcdefgh'.indexOf(c[0])], a = rc(from), z = rc(to);
    play(a[0], a[1], z[0], z[1], 'Q');
    return { w: CLK.w, b: CLK.b, mb: document.getElementById('mb').textContent };
  }, ['e2', 'e4']);
  ok('no increment when the control has none', mv.w <= 60000 && mv.w >= 59000 && mv.b === 60000 && mv.mb === '1:00', mv);

  // ---- 3+2: increment lands on the mover's clock ----------------------------
  const inc = await pg.evaluate(([from, to]) => {
    blitz = 3; blitzInc = 2; startGame(2); blitzLabel();
    const start = document.getElementById('mw').textContent;
    const rc = c => [8 - (+c[1]), 'abcdefgh'.indexOf(c[0])], a = rc(from), z = rc(to);
    play(a[0], a[1], z[0], z[1], 'Q');
    return { start, w: CLK.w, b: CLK.b, label: document.getElementById('bz').textContent };
  }, ['d2', 'd4']);
  ok('3+2 starts at 3:00 and labels the control', inc.start === '3:00' && inc.label === 'BLITZ: 3+2 MIN', inc);
  ok('fischer increment lands on the mover clock', inc.w > 180000 && inc.w <= 182000 && inc.b === 180000, inc);
  const inc2 = await pg.evaluate(([from, to]) => {
    const rc = c => [8 - (+c[1]), 'abcdefgh'.indexOf(c[0])], a = rc(from), z = rc(to);
    play(a[0], a[1], z[0], z[1], 'Q');
    return { w: CLK.w, b: CLK.b };
  }, ['e7', 'e5']);
  ok('both clocks pick up the increment', inc2.b > 180000 && inc2.b <= 182000 && inc2.w > 180000, inc2);

  // ---- snapshot keeps the increment ------------------------------------------
  const snap = await pg.evaluate(() => {
    blitz = 5; blitzInc = 3; startGame(2); shSave();
    blitz = 0; blitzInc = 0;
    const okr = shRestore();
    return { okr, blitz, blitzInc, w: CLK.w };
  });
  ok('snapshot round-trips the increment', snap.okr === true && snap.blitz === 5 && snap.blitzInc === 3 && snap.w === 300000, snap);

  // ---- flag fall still ends it -----------------------------------------------
  await pg.evaluate(() => { CLK.b = 1; turn = 'b'; clkT0 = Date.now(); });
  const flagged = await pg.waitForFunction(() => over === true && flagWin === true, null, { timeout: 4000 }).then(() => true).catch(() => false);
  const ff = await pg.evaluate(() => ({ over, flagWin, b: CLK.b, mb: document.getElementById('mb').textContent }));
  ok('flag fall ends the game at 0:00', flagged && ff.over && ff.flagWin && ff.b === 0 && ff.mb === '0:00', ff);

  await pg.close(); await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
