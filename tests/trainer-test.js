// Mistake trainer checks: node tests/trainer-test.js
// Seeded ladder game with a queen hang: drill generation, HUD, good/miss grading,
// the once-a-day XP cap, best-score persistence, and the empty-profile path.
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

  // seed a ladder game where white hangs the queen: 1.e4 e5 2.Qh5 Nc6 3.Qxe5+??
  await pg.evaluate(() => {
    prof.games = [{ id: 'moss', res: 'l', plies: 5, ms: 1000, caps: 0, left: 1, undos: 0, date: Date.now(), san: 'e4 e5 Qh5 Nc6 Qxe5+' }];
    trnLabel();
  });
  ok('trainer label resets on the title', await pg.evaluate(() => document.getElementById('trnLab').textContent === 'MISTAKE TRAINER'));

  // ---- run one: fix the drill -------------------------------------------------
  await pg.click('#btnTrain');
  const st = await pg.evaluate(() => ({
    g: gmode, idx: trnIdx, n: trnList.length, over, turn, q: b[3] && b[3][7],
    un: document.getElementById('un').disabled, hn: document.getElementById('hn').disabled,
    bt: document.getElementById('bt').textContent, titleOn: document.getElementById('s-title').classList.contains('on')
  }));
  ok('trainer starts with the drills it found', st.g === 'train' && st.n === 1 && st.idx === 0 && !st.over && !st.titleOn, st);
  ok('drill board is the moment before the blunder', st.turn === 'w' && st.q === 'wQ', st);
  ok('trainer disables undo and hint', st.un === true && st.hn === true, st);
  ok('HUD announces the drill and the score', /DRILL 1\/1/.test(st.bt) && /FIXED: 0/.test(st.bt), st.bt);

  const good = await pg.evaluate(() => { play(7, 6, 5, 5, 'Q'); return { idx: trnIdx, score: trnScore, over, bt: document.getElementById('bt').textContent }; });
  ok('a healthy move is fixed and advances', good.idx === 1 && good.score === 1 && !good.over, good);
  ok('feedback congratulates the fix', /GOOD!/.test(good.bt), good.bt);

  const done = await pg.waitForFunction(() => document.getElementById('s-over').classList.contains('on'), null, { timeout: 5000 }).then(() => true).catch(() => false);
  const d1 = await pg.evaluate(() => ({ os: document.getElementById('os').textContent, oq: document.getElementById('oq').textContent, xp: prof.xp | 0, best: prof.trn.best, last: prof.trn.last, ts: trnScore }));
  ok('the session ends on the results screen', done && d1.os === 'MISTAKE TRAINER: 1/1 FIXED', d1);
  ok('first session pays 5 XP and records the best', d1.xp === 5 && d1.best === 1 && d1.oq.includes('+5 XP'), d1);

  // ---- run two: replay the old blunder, same day pays nothing ----------------
  await pg.evaluate(() => toTitle());
  await pg.click('#btnTrain');
  const bad = await pg.evaluate(() => { play(3, 7, 3, 4, 'Q'); return { idx: trnIdx, score: trnScore, bt: document.getElementById('bt').textContent }; });
  ok('the old blunder grades as a miss', bad.idx === 1 && bad.score === 0 && /MISTAKE - BEST WAS/.test(bad.bt), bad);
  const done2 = await pg.waitForFunction(() => document.getElementById('s-over').classList.contains('on'), null, { timeout: 6000 }).then(() => true).catch(() => false);
  const d2 = await pg.evaluate(() => ({ os: document.getElementById('os').textContent, oq: document.getElementById('oq').textContent, xp: prof.xp | 0, best: prof.trn.best }));
  ok('replay ends at 0/1 and pays nothing', done2 && d2.os === 'MISTAKE TRAINER: 0/1 FIXED' && d2.xp === 5 && d2.best === 1, d2);
  ok('replay is flagged as already trained', /ALREADY TRAINED/.test(d2.oq), d2.oq);

  // ---- persistence and the empty-profile path --------------------------------
  await pg.reload();
  await pg.waitForTimeout(400);
  ok('trainer best survives a reload', await pg.evaluate(() => document.getElementById('trnLab').textContent === 'MISTAKE TRAINER - BEST 1/5'));
  const none = await pg.evaluate(() => {
    prof.games = [];
    startTrainer();
    return { inGame, g: gmode, tq: document.getElementById('tq').textContent };
  });
  ok('no games means no drills, just a hint on the title', none.inGame === false && none.g !== 'train' && /NO MISTAKES YET/.test(none.tq), none);

  await pg.close(); await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
