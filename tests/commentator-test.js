// Commentator end-to-end: on-board tips, dual-voice talk-back, worker analysis, sheet fallback. Run: node tests/commentator-test.js
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  const errs = []; let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
  const pg = await br.newPage({ viewport: { width: 390, height: 780 } });
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto('file://' + __dirname + '/../chess/index.html');

  // ---- the switch is the old tutor switch, and old saves migrate ----
  await pg.evaluate(() => { localStorage.setItem('pixelchess.v1', JSON.stringify({ v: 1, tutor: 1 })); });
  await pg.reload();
  ok('old tutor save migrates to commentator', await pg.evaluate(() => cmt === 1 && prof.cmt === 1));
  ok('settings switch shows comment on', await pg.evaluate(() => document.getElementById('swTut').classList.contains('on') && document.getElementById('swTut').getAttribute('aria-checked') === 'true'));
  await pg.evaluate(() => setCmt(1));
  ok('commentator switch turns on cleanly', await pg.evaluate(() => cmt === 1 && prof.cmt === 1));

  // ---- local 2P game: headline + on-board tips + talk-back ----
  await pg.click('[data-m="2"]');
  await pg.evaluate(() => { fx = false; snd = false; });
  const mv = async (a, b2) => { await pg.evaluate(([a, b2]) => { const q = s => [8 - +s[1], 'abcdefgh'.indexOf(s[0])]; const [r, c] = q(a), [y, x] = q(b2); play(r, c, y, x, 'Q'); }, [a, b2]); await pg.waitForFunction(() => !an, null, { timeout: 3000 }).catch(() => {}); await pg.waitForTimeout(80); };
  await mv('e2', 'e4');
  ok('headline appears after a move', await pg.evaluate(() => document.querySelector('#bub').classList.contains('on') && document.getElementById('bt').textContent.length > 3));
  ok('headline names a verdict', await pg.evaluate(() => /BEST|GOOD|GREAT|INACCURACY|EXCELLENT|BOOK|MISS|MISTAKE|BLUNDER|BRILLIANT|MATE/.test(document.getElementById('bt').textContent)));
  ok('instant analysis is stored', await pg.evaluate(() => !!cmtLog[1] && cmtLog[1].head.length > 0));
  ok('second worker refines the analysis', await pg.waitForFunction(() => cmtLog[hist.length] && cmtLog[hist.length].worker === 1, null, { timeout: 15000 }).then(() => true).catch(() => false));
  const ex1 = await pg.evaluate(() => ({ alts: cmtLog[1].alt.length, mv: cmtLog[1].alt[0] && cmtLog[1].alt[0].mv.length, plan: cmtLog[1].plan.length, learn: cmtLog[1].learn.length }));
  ok('analysis carries alternatives with board moves', ex1.alts >= 1 && ex1.mv === 4, JSON.stringify(ex1));
  ok('analysis carries plans and concepts', ex1.plan >= 1 && ex1.learn >= 1);

  // ---- tapping the bubble toggles on-board tip arrow without modal overlay ----
  const altMv = await pg.evaluate(() => cmtLog[1].alt[0].mv);
  await pg.click('#bub');
  ok('tapping the bubble activates on-board tip arrow', await pg.evaluate(() => cmtTipActive && cmArrows.length === 1));
  ok('tip arrow matches alternative move', await pg.evaluate(mv => JSON.stringify(cmArrows[0].slice(0, 4)) === JSON.stringify(mv), altMv));
  ok('bubble displays tip with alternative SAN', await pg.evaluate(() => /TIP/.test(document.getElementById('bt').textContent)));
  ok('ghost piece is configured in arrow', await pg.evaluate(() => !!cmArrows[0][5]));
  ok('sheet is NOT opened during live gameplay', await pg.evaluate(() => !document.querySelector('#s-cmt').classList.contains('on')));

  // second tap toggles or cycles
  await pg.click('#bub');
  ok('second tap cycles or dismisses on-board tip', await pg.evaluate(() => !cmtTipActive || cmArrows.length === 1));

  // ---- sheet fallback: cmtShow still available for deep inspection ----
  await pg.evaluate(() => cmtShow(1));
  ok('sheet can still be opened for deep inspection', await pg.evaluate(() => document.querySelector('#s-cmt').classList.contains('on')));
  ok('sheet shows the verdict section', /VERDICT/.test(await pg.locator('#cmtS').innerText()));
  ok('sheet shows what the move does', /WHAT IT DOES/.test(await pg.locator('#cmtS').innerText()));
  ok('sheet has alternative buttons', (await pg.locator('#cmtS [data-cma]').count()) >= 1);
  ok('sheet names kibitz and his title', /KIBITZ/.test(await pg.locator('#cmtbox').innerText()));
  ok('sheet shows a kibitz quip', await pg.evaluate(() => document.getElementById('cmtQ').textContent.length > 10));
  ok('kibitz portrait is drawn', await pg.evaluate(() => { const d = document.getElementById('ck').getContext('2d').getImageData(0, 0, 16, 16).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; }) > 40);
  const port1 = await pg.evaluate(() => document.getElementById('ck').toDataURL());

  await pg.locator('#cmtS [data-cma]').first().click();
  ok('preview collapses the sheet to a bar', await pg.evaluate(() => document.getElementById('cmtbox').classList.contains('mini')));
  ok('preview draws the clicked alternative', await pg.evaluate(mv => cmArrows.length === 1 && JSON.stringify(cmArrows[0].slice(0, 4)) === JSON.stringify(mv), altMv));
  ok('preview bar names the move', await pg.evaluate(() => document.getElementById('cmtH').textContent.startsWith('PREVIEW ')));
  await pg.click('#cmtX');
  ok('closing restores the real position', await pg.evaluate(() => !document.querySelector('#s-cmt').classList.contains('on') && b[4][4] === 'wP' && cmArrows.length === 0));

  // ---- fool's mate g4: blunder headline, on-board tip, keyboard toggle & escape ----
  await pg.evaluate(() => startGame(2));
  await pg.evaluate(() => { fx = false; snd = false; });
  await mv('f2', 'f3'); await mv('e7', 'e5'); await mv('g2', 'g4');
  ok('g4 headline calls it a blunder', await pg.evaluate(() => /BLUNDER/.test(document.getElementById('bt').textContent)));
  ok('g4 analysis knows about mate', await pg.evaluate(() => /MATE/.test(cmtLog[3].head + ' ' + cmtLog[3].threat.join(' '))));
  await pg.keyboard.press('c');
  ok('keyboard c toggles on-board tip', await pg.evaluate(() => cmtTipActive && cmArrows.length === 1));
  ok('on-board tip arrow points to better move', await pg.evaluate(() => cmArrows.length === 1 && cmArrows[0].length >= 5));
  await pg.keyboard.press('Escape');
  ok('escape dismisses the on-board tip arrow', await pg.evaluate(() => !cmtTipActive && cmArrows.length === 0));
  ok('escape did not pause the game', await pg.evaluate(() => !paused));

  // ---- AI game: dual-voice talk-back & opponent move response ----
  await pg.evaluate(() => startGame(1, OPPS[0], false));
  await pg.evaluate(() => { fx = false; snd = false; });
  await mv('d2', 'd4');
  const replied = await pg.waitForFunction(() => hist.length >= 2, null, { timeout: 6000 }).then(() => true).catch(() => false);
  ok('cpu replies normally during game', replied);
  const head2 = await pg.evaluate(() => document.getElementById('bt').textContent.length > 3);
  ok('opponent move gets speech headline', head2);

  // ---- own blunder in an AI game auto-shows on-board tip without blocking modal ----
  await pg.evaluate(() => startGame(1, OPPS[0], false));
  await pg.evaluate(() => { fx = false; snd = false; });
  await mv('f2', 'f3');
  await pg.evaluate(() => { reqId++; play(1, 4, 3, 4, 'Q'); }); // hand-play black's e5
  await pg.waitForFunction(() => !an, null, { timeout: 3000 }).catch(() => {});
  await mv('g2', 'g4');
  ok('own blunder triggers on-board tip automatically', await pg.evaluate(() => cmtTipActive && cmArrows.length === 1));
  ok('board remains unblocked by sheet overlay', await pg.evaluate(() => !document.querySelector('#s-cmt').classList.contains('on')));
  ok('speech bubble gives blunder tip', await pg.waitForFunction(() => /TIP|BLUNDER/.test(document.getElementById('bt').textContent), null, { timeout: 6000 }).then(() => true).catch(() => false));
  const resumed = await pg.waitForFunction(() => hist.length >= 4, null, { timeout: 8000 }).then(() => true).catch(() => false);
  ok('cpu moves while on-board tips guide player', resumed);

  // daily puzzle stays spoiler-free even with the commentator on
  const puz = await pg.evaluate(() => { try { startPuzzle(puzDay(Date.now())); } catch (e) { return 'start:' + e.message; } const m = all(b, turn)[0]; if (!m) return 'no moves'; play(m[0], m[1], m[2], m[3], 'Q'); return 'ok'; });
  await pg.waitForTimeout(500);
  ok('daily puzzle gets no commentary (no spoilers)', puz === 'ok' && await pg.evaluate(() => Object.keys(cmtLog).length === 0), puz);

  ok('no page errors', errs.length === 0, errs.join(' | '));
  await pg.close(); await br.close();
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
