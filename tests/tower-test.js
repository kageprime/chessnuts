// The tower checks: node tests/tower-test.js
// Floors 1-4 are the campaign, floor f>=5 fights tier e(f-4). Every 8th floor is a tower boss
// (maxed out, on the way up it refills your 3 lives). A loss on the current floor burns a life;
// the last life wipes you back to the tower base. Records, lives, and best floor survive reloads.
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
  const camp = { moss: { w: 1, l: 0, d: 0 }, vex: { w: 1, l: 0, d: 0 }, dune: { w: 1, l: 0, d: 0 }, nox: { w: 1, l: 0, d: 0 } };
  const tiers = (a, b) => { const r = {}; for (let n = a; n <= b; n++) r['e' + n] = { w: 1, l: 0, d: 0 }; return r; };
  const towerSeed = (end, lv, hi, rec) => seed({
    v: 1, unlocked: ['moss', 'vex', 'dune', 'nox'], end, hi, lv, xp: 900, streak: 0, bestStreak: 3, total: { w: 9, l: 1, d: 0 },
    rec, games: [], theme: { board: 'scene', piece: 'classic' }, top: { fast: {}, mate: {}, streaks: [] },
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
  // ---- climb the campaign into the tower, then lose a life ----
  {
    const pg = await mk({ width: 390, height: 780 });
    await pg.click('[data-m="1"]');
    ok('fresh tower shows four floors, one sealed', (await pg.locator('.oc').count()) === 4 && (await pg.locator('.oc.sealed').count()) === 1);
    ok('floor 4 is a sealed mystery', /SEALED - BEAT OLD DUNE/.test(await pg.locator('.oc.sealed').innerText()) && /FLOOR 4 - ELO 1200/.test(await pg.locator('.oc.sealed').innerText()));
    ok('the summit tracker names the first boss', (await pg.locator('#ol .lab').innerText()).includes('NEXT BOSS: FLOOR 8 - NOX VIII - ELO 1400'));
    ok('menu strip shows tower, floor, elo and lives', (await pg.locator('#osm').innerText()).includes('THE TOWER - TOWER I - FLOOR 1 - ELO 1050 - LIVES 3/3'));
    const cur1 = pg.locator('.oc.cur');
    ok('floor 1 is Mossback and you are here', /MOSSBACK/.test(await cur1.innerText()) && /FLOOR 1 - EASY - ELO 1050/.test(await cur1.innerText()) && /YOU ARE HERE/.test(await cur1.innerText()));
    await cur1.click();
    await mate(pg);
    ok('beating Mossback still unlocks Vex', /NEW OPPONENT: LADY VEX!/.test(await pg.locator('#out').innerText()));
    await pg.click('#nx'); await mate(pg);
    ok('beating Vex still unlocks Dune', /NEW OPPONENT: OLD DUNE!/.test(await pg.locator('#out').innerText()));
    await pg.click('#nx'); await mate(pg);
    const clearTxt = await pg.locator('#out').innerText();
    const cl = await pg.evaluate(() => ({ end: prof.end, nx: document.getElementById('nx').textContent, save: JSON.parse(localStorage.getItem('pixelchess.v1')).end }));
    ok('clearing the campaign opens the tower at floor 5', /LADDER CLEARED - THE TOWER OPENS!/.test(clearTxt) && /SECRET OPPONENT: NOX!/.test(clearTxt) && /FLOOR 5 AWAITS: MOSSBACK V!/.test(clearTxt), clearTxt);
    ok('floor 5 is live and saved', cl.end === 1 && cl.save === 1 && cl.nx === 'NEXT: NOX', cl);
    await pg.click('#mn'); await pg.click('[data-m="1"]');
    ok('NOX is now the current floor', /NOX/.test(await pg.locator('.oc.cur').innerText()) && /FLOOR 4 - SECRET - ELO 1200/.test(await pg.locator('.oc.cur').innerText()) && (await pg.locator('.oc.sealed').count()) === 0);
    ok('the floors above the secret boss are locked', (await pg.locator('#ol .oc[data-f="5"]').innerText()).includes('LOCKED - BEAT NOX'));
    await pg.locator('.oc.cur').click();
    await mate(pg);
    ok('beating the secret NOX lands you on floor 5', await pg.evaluate(() => curFloor(prof) === 5 && prof.hi === 4 && prof.rec.nox.w === 1));
    await pg.click('#mn'); await pg.click('[data-m="1"]');
    const cur5 = pg.locator('.oc.cur');
    ok('floor 5 is Mossback V again', /MOSSBACK V/.test(await cur5.innerText()) && /FLOOR 5 - ELO 1250/.test(await cur5.innerText()));
    ok('the boss and two floors above are locked', (await pg.locator('.oc.lk').count()) === 3);
    await cur5.click();
    const snap = await pg.evaluate(() => { const s = shSnapshot(); return s && { ok: !!shValid(s), oppId: s.oppId }; });
    ok('tower games snapshot as themselves', snap.ok && snap.oppId === 'e1', snap);
    await mate(pg);
    const w5 = await pg.evaluate(() => ({ end: prof.end, nx: document.getElementById('nx').textContent, out: document.getElementById('out').innerText, w: prof.rec.e1.w }));
    ok('floor 5 clear names the next rival', w5.end === 2 && w5.nx === 'NEXT: LADY VEX VI' && /FLOOR 5 CLEARED! NEXT: LADY VEX VI!/.test(w5.out) && w5.w === 1, w5);
    ok('tower wins post no world bests', !/NEW BEST|TOP 5/.test(w5.out), w5.out);
    await pg.click('#nx');
    ok('NEXT takes you to floor 6', await pg.evaluate(() => opp.id === 'e2' && opp.name === 'LADY VEX VI' && gmode === 'ladder'));
    await lose(pg);
    await pg.waitForSelector('#s-over.on', { timeout: 4000 });
    ok('a loss on the current floor burns a life', await pg.evaluate(() => prof.end === 2 && prof.lv === 2 && prof.streak === 0 && prof.rec.e2.l === 1) && /STREAK LOST/.test(await pg.locator('#out').innerText()) && /LIVES LEFT: 2/.test(await pg.locator('#out').innerText()));
    ok('no NEXT after a loss', (await pg.locator('#nx.on').count()) === 0);
    await reload(pg);
    await pg.click('[data-m="1"]');
    ok('lives survive a reload', (await pg.locator('#osm').innerText()).includes('FLOOR 6 - ELO 1300 - LIVES 2/3'));
    await pg.locator('#ol .oc[data-f="5"]').click();
    ok('a beaten floor can be replayed', await pg.evaluate(() => inGame && opp.id === 'e1' && gmode === 'ladder'));
    await lose(pg);
    await pg.waitForSelector('#s-over.on', { timeout: 4000 });
    ok('a loss on a beaten floor costs nothing', await pg.evaluate(() => prof.lv === 2 && prof.end === 2) && !/LIVES LEFT/.test(await pg.locator('#out').innerText()));
    await pg.context().close();
  }
  // ---- the wipe: last life on the tower II boss sends you back to its base ----
  {
    const pg = await mk({ width: 390, height: 780 }, towerSeed(12, 1, 16, Object.assign(tiers(1, 11), camp)));
    await pg.click('[data-m="1"]');
    ok('the tower boss floor crowns the little window', (await pg.locator('#ol .lab').innerText()).includes('TOWER BOSS NOW: FLOOR 16 - NOX XVI - ELO 1800') && (await pg.locator('.oc').count()) === 4);
    ok('the boss card wears the crest', /NOX XVI/.test(await pg.locator('.oc.cur').innerText()) && /TOWER BOSS - FLOOR 16 - ELO 1800/.test(await pg.locator('.oc.cur').innerText()) && (await pg.locator('.oc.boss').count()) === 1);
    ok('one life left on the strip', (await pg.locator('#osm').innerText()).includes('TOWER II - FLOOR 16 - ELO 1800 - LIVES 1/3'));
    await pg.locator('.oc.cur').click();
    await lose(pg);
    await pg.waitForSelector('#s-over.on', { timeout: 4000 });
    const wi = await pg.evaluate(() => ({ end: prof.end, lv: prof.lv, hi: prof.hi, saveEnd: JSON.parse(localStorage.getItem('pixelchess.v1')).end }));
    ok('the last life wipes back to floor 9', wi.end === 5 && wi.lv === 3 && wi.hi === 16 && wi.saveEnd === 5, wi);
    ok('the wipe is announced', /OUT OF LIVES - TOWER II ATTEMPT OVER! BACK TO FLOOR 9\./.test(await pg.locator('#out').innerText()));
    await pg.click('#mn'); await pg.click('[data-m="1"]');
    ok('the tower restarts at its base floor', (await pg.locator('#osm').innerText()).includes('TOWER II - FLOOR 9 - ELO 1450 - LIVES 3/3'));
    ok('floor 9 is the current rival again', /MOSSBACK IX/.test(await pg.locator('.oc.cur').innerText()) && /FLOOR 9 - ELO 1450/.test(await pg.locator('.oc.cur').innerText()));
    ok('the floors above are locked again', (await pg.locator('#ol .oc[data-f="10"]').innerText()).includes('LOCKED - BEAT MOSSBACK IX'));
    await pg.context().close();
  }
  // ---- beating a tower boss refills lives and clears the tower ----
  {
    const pg = await mk({ width: 390, height: 780 }, towerSeed(4, 2, 7, Object.assign(tiers(1, 3), camp)));
    await pg.click('[data-m="1"]');
    ok('the floor 8 boss stands at the top', (await pg.locator('#ol .lab').innerText()).includes('TOWER BOSS NOW: FLOOR 8 - NOX VIII - ELO 1400'));
    await pg.locator('.oc.cur').click();
    await mate(pg);
    const bo = await pg.evaluate(() => ({ end: prof.end, lv: prof.lv, hi: prof.hi, out: document.getElementById('out').innerText, nx: document.getElementById('nx').textContent }));
    ok('the boss falls and the tower is cleared', bo.end === 5 && bo.hi === 8 && /FLOOR 8 CLEARED - TOWER I BOSS DOWN! TOWER II BEGINS!/.test(bo.out) && /LIVES RESTORED/.test(bo.out) && bo.nx === 'NEXT: MOSSBACK IX', bo);
    ok('lives refill after the boss', bo.lv === 3);
    await pg.click('#mn'); await pg.click('#pf');
    const ptxt = await pg.locator('#pbody').innerText();
    ok('profile shows the tower record', /TOWER FLOOR/.test(ptxt) && /TOWER ELO/.test(ptxt) && /TOWERS CLEARED/.test(ptxt) && /TOWER RIVALS/.test(ptxt) && /LIVES/.test(ptxt) && /W4 L0 D0/.test(ptxt), ptxt.slice(0, 400));
    await pg.context().close();
  }
  // ---- the ultimate elo at floor 40 ----
  {
    const pg = await mk({ width: 390, height: 780 }, towerSeed(36, 2, 39, camp));
    await pg.click('[data-m="1"]');
    ok('floor 40 is the ultimate elo', (await pg.locator('.oc.cur').innerText()).includes('NOX XL') && (await pg.locator('.oc.cur').innerText()).includes('TOWER BOSS - FLOOR 40 - ELO 3000') && (await pg.locator('#osm').innerText()).includes('ELO 3000 - LIVES 2/3'));
    await pg.locator('.oc.cur').click();
    await mate(pg);
    const ul = await pg.evaluate(() => ({ end: prof.end, lv: prof.lv, hi: prof.hi, out: document.getElementById('out').innerText, nx: document.getElementById('nx').textContent }));
    ok('beating the ultimate boss clears tower V', ul.end === 37 && ul.hi === 40 && /FLOOR 40 CLEARED - TOWER V BOSS DOWN! TOWER VI BEGINS!/.test(ul.out) && /ULTIMATE ELO DEFEATED!/.test(ul.out) && ul.nx === 'NEXT: MOSSBACK XLI', ul);
    await pg.context().close();
  }
  // ---- a deep tier: window, labels, escalation, engine budget ----
  {
    const pg = await mk({ width: 390, height: 780 }, towerSeed(57, 3, 58, Object.assign(camp, tiers(1, 54), { e56: { w: 0, l: 1, d: 0 } })));
    await pg.click('[data-m="1"]');
    ok('deep save lands on floor 61 of tower VIII', (await pg.locator('#osm').innerText()).includes('THE TOWER - TOWER VIII - FLOOR 61 - ELO 4050 - LIVES 3/3'));
    ok('seven floors of the tower are in view', (await pg.locator('.oc').count()) === 7 && (await pg.locator('#ol .lab').innerText()).includes('NEXT BOSS: FLOOR 64 - NOX LXIV - ELO 4200'));
    ok('the highest floor sits on top', (await pg.locator('.oc').first().getAttribute('data-f')) === '64' && (await pg.locator('.oc').last().getAttribute('data-f')) === '58');
    const labels = await pg.locator('#ol .oc em').allInnerTexts();
    ok('beaten floors read BEATEN, current is here, unplayed says so', labels.includes('BEATEN - W0 L1 D0') && labels.includes('YOU ARE HERE') && labels.includes('NOT PLAYED YET'), labels);
    ok('above the frontier the floors tease the one to beat', (await pg.locator('.oc.lk').count()) === 3 && (await pg.locator('#ol .oc[data-f="62"]').innerText()).includes('LOCKED - BEAT MOSSBACK LXI'));
    const cur61 = pg.locator('.oc.cur');
    ok('floor 61 recycles Mossback as LXI at max budget', /MOSSBACK LXI/.test(await cur61.innerText()) && /FLOOR 61 - ELO 4050/.test(await cur61.innerText()));
    await cur61.click();
    ok('the current floor is playable at its own strength', await pg.evaluate(() => inGame && opp.id === 'e57' && gmode === 'ladder' && opp.ms === 1800));
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
    const w61 = await pg.evaluate(() => ({ end: prof.end, nx: document.getElementById('nx').textContent, out: document.getElementById('out').innerText }));
    ok('clearing floor 61 climbs to floor 62', w61.end === 58 && w61.nx === 'NEXT: LADY VEX LXII' && /FLOOR 61 CLEARED! NEXT: LADY VEX LXII!/.test(w61.out), w61);
    await pg.click('#mn'); await pg.click('#pf');
    const ptxt = await pg.locator('#pbody').innerText();
    ok('deep profile keeps the tower record', /TOWER FLOOR/.test(ptxt) && /TOWER ELO/.test(ptxt) && /TOWER RIVALS/.test(ptxt), ptxt.slice(0, 400));
    await pg.context().close();
  }
  // ---- layout: the tower window fits every viewport ----
  for (const [name, vp] of [['portrait', { width: 390, height: 780 }], ['small', { width: 360, height: 640 }], ['landscape', { width: 740, height: 360 }]]) {
    const pg = await mk(vp, towerSeed(57, 3, 58, Object.assign(camp, tiers(1, 54), { e56: { w: 0, l: 1, d: 0 } })));
    await pg.click('[data-m="1"]');
    ok(name + ' tower header and counts', (await pg.locator('#ol .lab').count()) === 1 && (await pg.locator('.oc').count()) === 7);
    const last = pg.locator('.oc').last();
    await last.scrollIntoViewIfNeeded();
    const r = await last.boundingBox();
    ok(name + ' the lowest floor is reachable', r.y + r.height <= vp.height + 1 && r.x + r.width <= vp.width + 1, r);
    await pg.evaluate(() => { document.getElementById('s-opp').scrollTop = 0 });
    await pg.screenshot({ path: `tower-${name}.png` });
    await pg.context().close();
  }
  await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})();
