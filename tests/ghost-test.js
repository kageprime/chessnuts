// Ghost replay checks: node tests/ghost-test.js
// A record-holder's line as a shadow overlay on a ladder game: first-move arrow,
// following the ghost line, divergence, the race verdict, the fetch path, and cleanup.
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
  await pg.evaluate(() => { fx = false; snd = false; });
  const bt = () => pg.evaluate(() => document.getElementById('bt').textContent);

  // ---- run one: shadow the record line move for move -------------------------
  await pg.evaluate(() => {
    startGame(1, OPPS.find(o => o.id === 'moss'), false, {
      board: 'mate:moss', name: 'KAI', live: true,
      sans: ['e4', 'Bc4', 'Qh5', 'Qxf7#'], moves: 4, ms: 9000, goal: 'MATE IN <= 4 MOVES'
    });
    ai = false; // hand-play the reply for determinism
  });
  const a0 = await pg.evaluate(() => ({ g: ghost && ghost.name, live: ghost && ghost.live, ar: ghArrows.length, mv: ghArrows[0] && ghArrows[0].slice(0, 4), gmode }));
  ok('race starts with the ghost on the board', a0.g === 'KAI' && a0.live === true && a0.gmode === 'ladder', a0);
  ok('first ghost move is shadowed as an arrow', a0.ar === 1 && JSON.stringify(a0.mv) === '[6,4,4,4]', a0);
  ok('bubble names the ghost move and the goal', /GHOST KAI PLAYS E4/.test(await bt()) && /MATE IN <= 4/.test(await bt()), await bt());

  await pg.evaluate(() => { play(6, 4, 4, 4, 'Q'); play(1, 4, 3, 4, 'Q'); }); // e4 e5
  const a1 = await pg.evaluate(() => ({ ar: ghArrows.length, mv: ghArrows[0] && ghArrows[0].slice(0, 4), san: ghArrows[0] && ghArrows[0][4] }));
  ok('following the ghost advances to its next move', a1.ar === 1 && JSON.stringify(a1.mv) === '[7,5,4,2]' && a1.san === 'wB', a1);

  await pg.evaluate(() => { play(7, 5, 4, 2, 'Q'); play(0, 1, 2, 2, 'Q'); }); // Bc4 Nc6
  await pg.evaluate(() => { play(7, 3, 3, 7, 'Q'); play(0, 6, 2, 5, 'Q'); }); // Qh5 Nf6
  const a2 = await pg.evaluate(() => ({ ar: ghArrows.length, mv: ghArrows[0] && ghArrows[0].slice(0, 4) }));
  ok('ghost arrow tracks move four', a2.ar === 1 && JSON.stringify(a2.mv) === '[3,7,1,5]', a2);

  await pg.evaluate(() => play(3, 7, 1, 5, 'Q')); // Qxf7#
  const mateOk = await pg.evaluate(() => ({ over, mine: Math.max(1, Math.ceil(hist.length / 2)), ar: ghArrows.length }));
  ok('ghost arrows clear when the game ends', mateOk.over === true && mateOk.ar === 0 && mateOk.mine === 4, mateOk);
  const seen = await pg.waitForFunction(() => document.getElementById('s-over').classList.contains('on'), null, { timeout: 4000 }).then(() => true).catch(() => false);
  const a3 = await pg.evaluate(() => ({ ot: document.getElementById('ot').textContent, oq: document.getElementById('oq').textContent }));
  ok('the race verdict lands on the over screen', seen && /YOU BEAT THE GHOST/.test(a3.oq) && /KAI/.test(a3.oq), [seen, a3]);
  ok('a ghost mate still reads CHECKMATE', a3.ot === 'CHECKMATE', a3.ot);

  // ---- run two: divergence kills the overlay ---------------------------------
  await pg.evaluate(() => {
    startGame(1, OPPS.find(o => o.id === 'moss'), false, {
      board: 'mate:moss', name: 'KAI', live: true,
      sans: ['e4', 'Bc4', 'Qh5', 'Qxf7#'], moves: 4, ms: 9000, goal: 'MATE IN <= 4 MOVES'
    });
    ai = false;
    play(6, 3, 4, 3, 'Q'); // d4, not the ghost's e4
  });
  const b = await pg.evaluate(() => ({ live: ghost && ghost.live, ar: ghArrows.length, inGame, bt: document.getElementById('bt').textContent }));
  ok('deviating ends the shadow and says so', b.live === false && b.ar === 0 && /DIVERGED/.test(b.bt), b);
  ok('the game itself plays on', b.inGame === true, b);

  // ---- raceGhost: fetch the record, white moves only, goal text ---------------
  await pg.evaluate(() => {
    window.fetch = async () => ({ json: async () => ({ ok: true, replay: { n: 'KAI', opp: 'moss', board: 'mate:moss', moves: 4, ms: 9000, san: 'e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#' } }) });
  });
  const c = await pg.evaluate(async () => {
    const okR = await raceGhost('mate:moss');
    return { okR, name: ghost && ghost.name, sans: ghost && ghost.sans && ghost.sans.join(' '), goal: ghost && ghost.goal, arrows: ghArrows.length, live: ghost && ghost.live, gmode };
  });
  ok('raceGhost loads the record and keeps white moves only', c.okR === true && c.name === 'KAI' && c.sans === 'e4 Bc4 Qh5 Qxf7#' && c.gmode === 'ladder' && c.live === true, c);
  ok('raceGhost shadows the opening move right away', c.arrows === 1, c);
  ok('raceGhost goal text matches the board kind', c.goal === 'MATE IN <= 4 MOVES', c.goal);

  await pg.evaluate(() => { window.fetch = async () => { throw new Error('offline'); }; });
  const d = await pg.evaluate(async () => (await raceGhost('mate:moss')) === false);
  ok('raceGhost gives up quietly when the store is unreachable', d === true);

  // ---- pure race math + cleanup ----------------------------------------------
  const v = await pg.evaluate(() => ({
    fastWin: ghostVerdict({ board: 'fast:moss', moves: 20, ms: 30000 }, 30, 20000).won,
    fastLose: ghostVerdict({ board: 'fast:moss', moves: 20, ms: 30000 }, 30, 40000).won,
    mateFewer: ghostVerdict({ board: 'mate:moss', moves: 6, ms: 9999 }, 5, 60000).won,
    mateTieFast: ghostVerdict({ board: 'mate:moss', moves: 6, ms: 9999 }, 6, 5000).won,
    mateTieSlow: ghostVerdict({ board: 'mate:moss', moves: 6, ms: 9999 }, 6, 20000).won,
    none: ghostVerdict(null, 1, 1)
  }));
  ok('ghostVerdict: fast board races on time', [v.fastWin, v.fastLose], [true, false]);
  ok('ghostVerdict: mate board races on moves then time', [v.mateFewer, v.mateTieFast, v.mateTieSlow], [true, true, false]);
  ok('ghostVerdict: no ghost means no verdict', v.none === null, v.none);

  const f = await pg.evaluate(() => { startGame(1, OPPS[0]); return { ghost: ghost, arrows: ghArrows.length }; });
  ok('a normal ladder game starts ghost-free', f.ghost === null && f.arrows === 0, f);

  await pg.close(); await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
