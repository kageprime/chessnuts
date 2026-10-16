const { chromium } = require('playwright');

(async () => {
  const br = await chromium.launch();
  const errs = []; let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
  const pg = await br.newPage({ viewport: { width: 390, height: 780 } });
  pg.on('pageerror', e => errs.push(e.message));

  await pg.goto('file://' + __dirname + '/../chess/index.html');

  // Test 1: Title Screen has Puzzle Survival button
  const rushBtn = await pg.locator('#btnRush');
  ok('title has puzzle survival button', await rushBtn.count() === 1);
  ok('puzzle survival button text', /PUZZLE SURVIVAL/.test(await rushBtn.innerText()));

  // Test 2: Start 2P game and test Feature C (Opening Banner) & Feature D (Eval Gauge)
  await pg.click('[data-m="2"]');
  await pg.evaluate(() => { fx = false; snd = false; });

  const mv = async (a, b2) => {
    await pg.evaluate(([a, b2]) => {
      const q = s => [8 - +s[1], 'abcdefgh'.indexOf(s[0])];
      const [r, c] = q(a), [y, x] = q(b2);
      play(r, c, y, x, 'Q');
    }, [a, b2]);
    await pg.waitForTimeout(60);
  };

  // Play 1. e4
  await mv('e2', 'e4');
  let openText = await pg.evaluate(() => document.getElementById('openBanner').textContent);
  ok('e4 detected as KING\'S PAWN', /KING'S PAWN/.test(openText), openText);
  ok('openBanner is visible', await pg.evaluate(() => document.getElementById('openBanner').classList.contains('on')));

  // Play 1... e5
  await mv('e7', 'e5');
  openText = await pg.evaluate(() => document.getElementById('openBanner').textContent);
  ok('e4 e5 detected as OPEN GAME', /OPEN GAME/.test(openText), openText);

  // Check Feature D: Eval Gauge
  const evalVisible = await pg.evaluate(() => {
    const eg = document.getElementById('evalGauge');
    return eg && window.getComputedStyle(eg).opacity === '1';
  });
  ok('eval gauge is active and visible', evalVisible);
  const evalVal = await pg.evaluate(() => document.getElementById('evalVal').textContent);
  ok('eval gauge has numeric readout', /[+-]?\d+\.\d+|M\d+/.test(evalVal), evalVal);

  // Test 3: Feature C - Tactical Board Annotations (Right-click arrows and highlights)
  const box = await pg.locator('#cv').boundingBox();
  const sq = (f, rk) => {
    const c = 'abcdefgh'.indexOf(f), rw = 8 - rk;
    return [box.x + (c + .5) * box.width / 8, box.y + (rw + .5) * box.height / 8];
  };

  // Right-click drag from g1 to f3 to draw arrow
  const [x1, y1] = sq('g', 1), [x2, y2] = sq('f', 3);
  await pg.mouse.move(x1, y1);
  await pg.mouse.down({ button: 'right' });
  await pg.mouse.move(x2, y2);
  await pg.mouse.up({ button: 'right' });

  const arrowsCount = await pg.evaluate(() => userArrows.length);
  ok('right-click drag adds tactical arrow', arrowsCount === 1, String(arrowsCount));

  // Right-click single square d4 to toggle square highlight
  const [x3, y3] = sq('d', 4);
  await pg.mouse.move(x3, y3);
  await pg.mouse.down({ button: 'right' });
  await pg.mouse.up({ button: 'right' });

  const sqCount = await pg.evaluate(() => userSquares.size);
  ok('right-click click toggles square highlight', sqCount === 1, String(sqCount));

  // Left click on board clears annotations
  await pg.mouse.click(box.x + 10, box.y + 10, { button: 'left' });
  const cleared = await pg.evaluate(() => userArrows.length === 0 && userSquares.size === 0);
  ok('left click clears tactical annotations', cleared);

  // Test 4: Feature A - Arcade Game Review & Accuracy Report Card
  // Play scholar's mate: 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#
  await mv('f1', 'c4');
  await mv('b8', 'c6');
  await mv('d1', 'h5');
  await mv('g8', 'f6');
  await mv('h5', 'f7'); // checkmate!

  await pg.waitForTimeout(400);

  // Check Game Review calculation
  const rev = await pg.evaluate(() => calcGameReview());
  ok('game review calculates White accuracy', rev && typeof rev.wAcc === 'number' && rev.wAcc >= 50, JSON.stringify(rev));
  ok('game review assigns arcade rank grade', /RANK [SABCD]/.test(rev.wGrade));
  ok('game review tallies move classifications', rev.counts && rev.counts.w && typeof rev.counts.w.good === 'number');
  ok('sparkline evaluations recorded', rev.sparkEvals.length > 3);

  // Open report modal
  await pg.evaluate(() => openGameReport());
  ok('report card modal is displayed', await pg.evaluate(() => document.getElementById('s-report').classList.contains('on')));
  const repWhAcc = await pg.locator('#repWhAcc').innerText();
  ok('report card displays accuracy percentage', /%/.test(repWhAcc), repWhAcc);

  // Close report modal
  await pg.click('#repCloseBtn');
  ok('report card modal closes cleanly', await pg.evaluate(() => !document.getElementById('s-report').classList.contains('on')));

  // Test 5: Feature B - Arcade Puzzle Rush / Survival Mode
  await pg.evaluate(() => toTitle());
  await pg.waitForTimeout(200);
  await pg.click('#btnRush');

  const inRush = await pg.evaluate(() => gmode === 'rush' && rushLives === 3 && inGame);
  ok('puzzle survival starts with 3 lives', inRush);
  const bubTxt = await pg.locator('#bt').innerText();
  ok('puzzle survival HUD displays hearts and score', /❤️❤️❤️.*SCORE: 0/.test(bubTxt), bubTxt);

  // Make an incorrect move: should lose a life
  // Find a piece and move it to an illegal/non-mate square
  const played = await pg.evaluate(() => {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (b[r][c] && b[r][c][0] === turn) {
          const ms = legal(b, r, c);
          if (ms.length > 0) {
            play(r, c, ms[0][0], ms[0][1], 'Q');
            return true;
          }
        }
      }
    }
    return false;
  });
  ok('move made in puzzle survival', played);
  await pg.waitForTimeout(300);

  const livesLeft = await pg.evaluate(() => rushLives);
  ok('incorrect move docks a life', livesLeft <= 2, 'Lives left: ' + livesLeft);

  await br.close();
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
