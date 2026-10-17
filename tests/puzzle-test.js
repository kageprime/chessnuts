// Puzzle archive checks: node tests/puzzle-test.js
// Daily puzzle history (prof.puz.days), the archive screen, past-day practice
// (no XP / no history), today's real credit, and history persistence.
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
  // plays the mating move for the side to move; returns a state read in one go
  const solve = () => pg.evaluate(() => {
    for (const m of all(b, turn)) {
      const nb = apply(b, m[0], m[1], m[2], m[3], 'Q'), oc = turn === 'w' ? 'b' : 'w';
      if (inCheck(nb, oc) && all(nb, oc).length === 0) {
        play(m[0], m[1], m[2], m[3], 'Q');
        return { done: true, xp: prof.xp | 0, days: Object.keys(prof.puz.days).length, last: prof.puz.last, pd: puzDone, streak: prof.puz.streak };
      }
    }
    return { done: false };
  });

  // ---- archive screen renders a 30-day grid with real history --------------
  await pg.click('#pa');
  const seeded = await pg.evaluate(() => {
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    prof.puz.days = prof.puz.days || {}; prof.puz.days[y] = 1; showPuzArchive();
    const c = document.querySelector('#pagrid [data-day="' + y + '"]');
    return { on: !!(c && c.classList.contains('on')), n: document.querySelectorAll('#pagrid .pcell').length,
      today: document.querySelectorAll('#pagrid .pcell.today').length, stat: document.getElementById('pastat').textContent };
  });
  ok('archive screen opens from the calendar button', await pg.evaluate(() => document.getElementById('s-puz').classList.contains('on') && !document.getElementById('s-title').classList.contains('on')));
  ok('archive grid renders 30 days', seeded.n === 30, seeded.n);
  ok('archive marks a solved day', seeded.on);
  ok('archive marks exactly one today cell', seeded.today === 1, seeded.today);
  ok('archive stat line counts the solved day', /SOLVED 1\/30/.test(seeded.stat), seeded.stat);

  // ---- a past day starts a no-XP practice game -----------------------------
  const started = await pg.evaluate(() => {
    const d = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const c = document.querySelector('#pagrid [data-day="' + d + '"]');
    const wasOn = c.classList.contains('on'); c.click();
    return { d, wasOn, g: gmode, pra: puzPractice, same: puzDayStr === d };
  });
  ok('past day starts a practice puzzle', started.g === 'puzzle' && started.pra === true && started.same === true && !started.wasOn, started);
  await pg.waitForFunction(() => { const t = document.getElementById('bt').textContent; return t.includes('PRACTICE') && t.includes('NO XP'); }, null, { timeout: 6000 }).catch(() => { });
  const praTxt = await pg.evaluate(() => document.getElementById('bt').textContent);
  ok('practice puzzle says NO XP up front', /PRACTICE/.test(praTxt) && /NO XP/.test(praTxt), praTxt);
  const pract = await solve();
  await pg.waitForFunction(() => document.getElementById('bt').textContent.includes('NO XP'), null, { timeout: 4000 }).catch(() => { });
  ok('practice solve awards nothing', pract.done && pract.xp === 0 && pract.days === 1 && pract.last === '' && !pract.pd && pract.streak === 0, pract);
  ok('practice solve says no XP', await pg.evaluate(() => /PRACTICE SOLVED/.test(document.getElementById('bt').textContent) && /NO XP/.test(document.getElementById('bt').textContent)));

  // ---- today still pays: 25 XP, history entry, streak ----------------------
  await pg.evaluate(() => toTitle());
  await pg.click('#pa'); await pg.click('#patoday');
  const dailyStarted = await pg.evaluate(() => ({ g: gmode, pra: puzPractice }));
  ok('today button starts the credited puzzle', dailyStarted.g === 'puzzle' && dailyStarted.pra === false, dailyStarted);
  const daily = await solve();
  ok('daily solve pays 25 XP and records the day', daily.done && daily.xp === 25 && daily.days === 2 && daily.last === (await pg.evaluate(() => puzDay(Date.now()))) && daily.pd === true && daily.streak === 1, daily);

  // ---- archive reflects the new state, practice day stays unmarked ---------
  const after = await pg.evaluate(() => {
    toTitle(); showPuzArchive();
    const t = puzDay(Date.now()), d = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const ct = document.querySelector('#pagrid [data-day="' + t + '"]'), cd = document.querySelector('#pagrid [data-day="' + d + '"]');
    return { today: !!(ct && ct.classList.contains('on')), past: !!(cd && cd.classList.contains('on')), stat: document.getElementById('pastat').textContent };
  });
  ok('archive marks today after solving', after.today);
  ok('archive stats show 2/30', /SOLVED 2\/30/.test(after.stat), after.stat);
  ok('practice day stays unmarked in history', !after.past);

  // ---- ESC backs out of the archive ----------------------------------------
  await pg.keyboard.press('Escape');
  ok('ESC backs out of the archive to the title', await pg.evaluate(() =>
    !document.getElementById('s-puz').classList.contains('on') &&
    document.getElementById('s-title').classList.contains('on') && document.activeElement.id === 'pa'));

  // ---- history survives a reload -------------------------------------------
  await pg.reload();
  await pg.waitForTimeout(400);
  await pg.click('#pa');
  const pers = await pg.evaluate(() => {
    const t = puzDay(Date.now()), d = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    return { today: document.querySelector('#pagrid [data-day="' + t + '"]').classList.contains('on'),
      past: document.querySelector('#pagrid [data-day="' + d + '"]').classList.contains('on'), xp: prof.xp | 0 };
  });
  ok('puzzle history survives a reload', pers.today && !pers.past && pers.xp === 25, pers);

  await pg.close(); await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
