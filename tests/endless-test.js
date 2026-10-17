// Endless ladder checks: node tests/endless-test.js
// Clearing the campaign opens tier 1 (MOSSBACK II); wins advance the tier, losses keep it,
// tiers recycle the campaign cast with roman numerals, and records + NOX survive reloads.
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  const errs = []; let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(x))); };
  const url = 'file://' + __dirname + '/../chess/index.html';
  // back-rank mate in one for White: Ra1-a8#
  const setMate = pg => pg.evaluate(() => {
    const e = Array.from({ length: 8 }, () => Array(8).fill(null));
    e[0][6] = 'bK'; e[1][5] = 'bP'; e[1][6] = 'bP'; e[1][7] = 'bP'; e[7][6] = 'wK'; e[7][0] = 'wR';
    e.cr = { wK: 0, wQ: 0, bK: 0, bQ: 0 }; e.ep = null; b = e; turn = 'w'; hist = []; status(); draw();
  });
  const mate = async pg => { await setMate(pg); await pg.evaluate(() => play(7, 0, 0, 0, 'Q')); await pg.waitForSelector('#s-over.on', { timeout: 4000 }); };
  const lose = pg => pg.evaluate(() => {   // black mates white: Ra8#
    const e = Array.from({ length: 8 }, () => Array(8).fill(null));
    e[0][0] = 'bR'; e[7][6] = 'wK'; e[6][5] = 'wP'; e[6][6] = 'wP'; e[6][7] = 'wP'; e[0][4] = 'bK';
    e.cr = { wK: 0, wQ: 0, bK: 0, bQ: 0 }; e.ep = null; b = e; turn = 'b'; hist = []; status(); draw(); play(0, 0, 7, 0, 'Q');
  });
  const seed = o => 'if(!localStorage.getItem("pixelchess.v1"))localStorage.setItem("pixelchess.v1",' + JSON.stringify(JSON.stringify(o)) + ')';
  const seedEnd = end => seed({
    v: 1, unlocked: ['moss', 'vex', 'dune', 'nox'], end, xp: 700, streak: 2, bestStreak: 3, total: { w: 3, l: 1, d: 0 },
    rec: { moss: { w: 1, l: 0, d: 0 }, vex: { w: 1, l: 0, d: 0 }, dune: { w: 1, l: 0, d: 0 }, e55: { w: 1, l: 0, d: 0 }, e56: { w: 0, l: 1, d: 0 } },
    games: [], theme: { board: 'scene', piece: 'classic' }, top: { fast: {}, mate: {}, streaks: [] },
    puz: { streak: 0, best: 0, last: '', wins: 0, days: {} }, trn: { last: '', best: 0, wins: 0 },
    fin: { eq: { P: 'base', N: 'base', B: 'base', R: 'base', Q: 'base', K: 'base' } }
  });
  const mk = async (vp, init) => {
    const ctx = await br.newContext({ viewport: vp }); const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(e.message));
    if (init) await pg.addInitScript(init);
    await pg.goto(url); await pg.waitForTimeout(300);
    await pg.evaluate(() => { fx = false; snd = false; });
    return pg;
  };
  const reload = async pg => { await pg.reload(); await pg.waitForTimeout(300); await pg.evaluate(() => { fx = false; snd = false; }); };
  // ---- clear the campaign through real games ----
  {
    const pg = await mk({ width: 390, height: 780 });
    await pg.click('[data-m="1"]');
    ok('fresh ladder has no endless section', (await pg.locator('#ol .lab').count()) === 0);
    await pg.locator('.oc').first().click();
    await mate(pg);
    ok('beating Mossback still unlocks Vex', /NEW OPPONENT: LADY VEX!/.test(await pg.locator('#out').innerText()));
    await pg.click('#nx');
    await mate(pg);
    ok('beating Vex still unlocks Dune', /NEW OPPONENT: OLD DUNE!/.test(await pg.locator('#out').innerText()));
    await pg.click('#nx');
    await mate(pg);
    const clearTxt = await pg.locator('#out').innerText();
    const clear = await pg.evaluate(() => ({ end: prof.end, nx: document.getElementById('nx').textContent, save: JSON.parse(localStorage.getItem('pixelchess.v1')).end }));
    ok('clearing reports Nox and the endless open', /LADDER CLEARED!/.test(clearTxt) && /SECRET OPPONENT: NOX!/.test(clearTxt) && /ENDLESS LADDER OPEN: MOSSBACK I AWAITS!/.test(clearTxt), clearTxt);
    ok('endless tier 1 is live and saved', clear.end === 1 && clear.save === 1 && clear.nx === 'NEXT: NOX', clear);
    await reload(pg);
    ok('NOX and endless progress survive a reload', await pg.evaluate(() => isUnlocked(prof, 'nox') && prof.end === 1 && prof.rec.dune.w === 1));
    await pg.click('[data-m="1"]');
    ok('ladder shows the endless section', (await pg.locator('#ol .lab').innerText()).includes('ENDLESS LADDER - TIER 1'));
    ok('menu strip mentions the tier', (await pg.locator('#osm').innerText()).includes('ENDLESS TIER 1'));
    ok('tier 2 teases the rival to beat first', (await pg.locator('.oc.lk').count()) === 1 && (await pg.locator('.oc.lk').innerText()).includes('LOCKED - BEAT MOSSBACK I'));
    const e1 = pg.locator('.oc').nth(4);
    ok('tier 1 card is MOSSBACK I', /MOSSBACK I/.test(await e1.innerText()) && /TIER 1/.test(await e1.innerText()));
    await e1.click();
    const st = await pg.evaluate(() => ({ id: opp.id, name: opp.name, mode: gmode, exh: exh, nb: document.getElementById('nb').textContent, un: document.getElementById('un').innerText }));
    ok('tier 1 starts as an endless ladder game', st.id === 'e1' && st.name === 'MOSSBACK I' && st.mode === 'ladder' && !st.exh && st.nb === 'MOSSBACK I' && st.un === 'UNDO 3', st);
    const snap = await pg.evaluate(() => { const s = shSnapshot(); return s && { ok: !!shValid(s), oppId: s.oppId }; });
    ok('endless games snapshot as themselves', snap.ok && snap.oppId === 'e1', snap);
    await mate(pg);
    const w1 = await pg.evaluate(() => ({ end: prof.end, nx: document.getElementById('nx').textContent, out: document.getElementById('out').innerText, w: prof.rec.e1.w }));
    ok('tier 1 clear unlocks LADY VEX II', w1.end === 2 && w1.nx === 'NEXT: LADY VEX II' && /ENDLESS TIER 1 CLEARED! NEW RIVAL: LADY VEX II!/.test(w1.out) && w1.w === 1, w1);
    ok('endless wins post no world bests', !/NEW BEST|TOP 5/.test(w1.out), w1.out);
    await pg.click('#nx');
    ok('NEXT takes you to tier 2', await pg.evaluate(() => opp.id === 'e2' && opp.name === 'LADY VEX II' && gmode === 'ladder'));
    await lose(pg);
    await pg.waitForSelector('#s-over.on', { timeout: 4000 });
    ok('a loss keeps the tier and resets the streak', await pg.evaluate(() => prof.end === 2 && prof.streak === 0 && prof.rec.e2.l === 1) && /STREAK LOST/.test(await pg.locator('#out').innerText()));
    ok('no NEXT after an endless loss', (await pg.locator('#nx.on').count()) === 0);
    await pg.context().close();
  }
  // ---- a seeded high tier: window, labels, escalation, engine budget ----
  {
    const pg = await mk({ width: 390, height: 780 }, seedEnd(57));
    await pg.click('[data-m="1"]');
    ok('seeded save keeps tier 57', (await pg.locator('#ol .lab').innerText()).includes('TIER 57') && (await pg.locator('#osm').innerText()).includes('ENDLESS TIER 57'));
    ok('the current tier and one either side are shown', (await pg.locator('.oc').count()) === 7 && (await pg.locator('.oc.lk').count()) === 1);
    const labels = await pg.locator('#ol .oc em').allInnerTexts();
    ok('beaten tier reads BEATEN, current is next up', labels.includes('BEATEN - W0 L1 D0') && labels.includes('NOT PLAYED YET'), labels);
    ok('the next tier teases the one to beat', (await pg.locator('.oc.lk').innerText()).includes('LOCKED - BEAT MOSSBACK LVII'));
    const gen = await pg.evaluate(() => { const o = endOpp(57), n1 = endOpp(1), n4 = endOpp(4), n60 = endOpp(60); return { name: o.name, lv: o.lv, lvl: o.lvl, ms: o.ms, bl: o.p.bl, id: o.id, viaId: oppById('e57').id, bad: oppById('x9'), n1: [n1.name, n1.ms], n4: [n4.name, n4.ms], n60: n60.name }; });
    ok('tier 57 recycles MOSSBACK with LVII and a maxed budget', gen.name === 'MOSSBACK LVII' && gen.lv === 'TIER 57' && gen.lvl === 1 && gen.ms === 1800 && gen.bl === 0 && gen.id === 'e57' && gen.viaId === 'e57' && !gen.bad, gen);
    ok('tier 1 starts at the base budget; NOX and LX name themselves', gen.n1[0] === 'MOSSBACK I' && gen.n1[1] === 260 && gen.n4[0] === 'NOX IV' && gen.n4[1] === 900 && gen.n60 === 'NOX LX', gen);
    await pg.locator('.oc').nth(5).click();
    ok('the current tier is playable at its own strength', await pg.evaluate(() => inGame && opp.id === 'e57' && gmode === 'ladder' && opp.ms === 1800));
    const spy = await pg.evaluate(() => new Promise(res => {
      window.__wk = null; window.__tm = null;
      const origPick = pick;
      pick = function () { window.__tm = arguments[3]; return origPick.apply(null, arguments) };
      let hasWk = !!wk;
      if (hasWk) { const o = wk.postMessage.bind(wk); wk.postMessage = m => { window.__wk = m; o(m) } }
      turn = 'b'; aiMove();
      setTimeout(() => res({ hasWk, wk: window.__wk, tm: window.__tm }), 200);
    }));
    ok('aiMove hands the engine the tier budget', spy.hasWk ? (spy.wk && spy.wk.ms === 1800 && spy.wk.lvl === 1 && spy.wk.pers && spy.wk.pers.bl === 0) : spy.tm === 1800, spy);
    await mate(pg);
    const w57 = await pg.evaluate(() => ({ end: prof.end, nx: document.getElementById('nx').textContent, out: document.getElementById('out').innerText }));
    ok('beating tier 57 unlocks tier 58', w57.end === 58 && w57.nx === 'NEXT: LADY VEX LVIII' && /ENDLESS TIER 57 CLEARED! NEW RIVAL: LADY VEX LVIII!/.test(w57.out), w57);
    await pg.click('#mn'); await pg.click('#pf');
    const ptxt = await pg.locator('#pbody').innerText();
    ok('profile screen shows endless progress', /ENDLESS TIERS BEATEN/.test(ptxt) && /ENDLESS RIVALS/.test(ptxt) && /W2 L1 D0/.test(ptxt), ptxt.slice(0, 400));
    await reload(pg);
    ok('tier progress, records, and games survive a reload', await pg.evaluate(() => prof.end === 58 && prof.rec.e57.w === 1 && prof.rec.e56.l === 1 && prof.games.some(g => g.id === 'e57')));
    await pg.click('[data-m="1"]');
    const e58 = pg.locator('.oc').nth(5);
    ok('tier 58 card is LADY VEX LVIII', /LADY VEX LVIII/.test(await e58.innerText()) && /TIER 58/.test(await e58.innerText()));
    await e58.click();
    ok('tier 58 is the current rival now', await pg.evaluate(() => opp.id === 'e58' && opp.lv === 'TIER 58'));
    const chain = await pg.evaluate(() => [nextOpp('moss').id, nextOpp('dune').id, nextOpp('nox').id, nextOpp('e58').id]);
    ok('NEXT follows the campaign, then the endless tier', chain.join(' ') === 'vex nox e58 e58', chain);
    await pg.context().close();
  }
  // ---- layout: the endless window fits every viewport ----
  for (const [name, vp] of [['portrait', { width: 390, height: 780 }], ['small', { width: 360, height: 640 }], ['landscape', { width: 740, height: 360 }]]) {
    const pg = await mk(vp, seedEnd(57));
    await pg.click('[data-m="1"]');
    ok(name + ' endless header and counts', (await pg.locator('#ol .lab').count()) === 1 && (await pg.locator('.oc').count()) === 7);
    const last = pg.locator('.oc').last();
    await last.scrollIntoViewIfNeeded();
    const r = await last.boundingBox();
    ok(name + ' last card reachable', r.y + r.height <= vp.height + 1 && r.x + r.width <= vp.width + 1, r);
    await pg.evaluate(() => { document.getElementById('s-opp').scrollTop = 0 });
    await pg.screenshot({ path: `endless-${name}.png` });
    await pg.context().close();
  }
  await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})();
