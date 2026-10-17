// Install prompt (title screen) checks: node tests/install-test.js
// Covers the ADD TO HOME SCREEN offer: gated to 3+ games, appears on
// beforeinstallprompt (or on iOS without it), prompts once, shakes off the
// appinstalled event and remembers being asked across reloads.
const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch();
  const errs = []; let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(x))); };
  const url = 'file://' + __dirname + '/../chess/index.html';
  const seed = n => `if(!localStorage.getItem('pixelchess.v1'))localStorage.setItem('pixelchess.v1',JSON.stringify({v:1,total:{w:${n},l:0,d:0}}))`;
  const mk = async (init, opts = {}) => {
    const ctx = await br.newContext(Object.assign({ viewport: { width: 390, height: 780 } }, opts));
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(e.message));
    if (init) await pg.addInitScript(init);
    await pg.goto(url); await pg.waitForTimeout(400);
    return pg;
  };
  const fire = pg => pg.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });

  // too few games: never offered, even when the browser says it is installable
  {
    const pg = await mk(seed(2));
    await fire(pg);
    ok('fewer than 3 games: no install offer', await pg.locator('#inst').isHidden());
    await pg.context().close();
  }
  // three games, but nothing installable and no iOS: hidden
  {
    const pg = await mk(seed(3));
    ok('3 games, nothing to install: no offer', await pg.locator('#inst').isHidden());
    await pg.context().close();
  }
  // three games + beforeinstallprompt: the offer shows up and prompts once
  {
    const pg = await mk(seed(3));
    await fire(pg);
    ok('installable after 3 games: offer appears', await pg.locator('#inst').isVisible());
    ok('offer reads ADD TO HOME SCREEN', /INSTALL[\s\S]*ADD TO HOME SCREEN/.test(await pg.locator('#inst').innerText()));
    await pg.screenshot({ path: 'install-offer.png' });
    await pg.click('#inst');
    ok('tapping it fires the browser prompt', await pg.evaluate(() => window.__prompted === 1));
    ok('the offer hides itself after asking', await pg.locator('#inst').isHidden() && await pg.evaluate(() => prof.inst === 1));
    await pg.reload(); await pg.waitForTimeout(300);
    await fire(pg);
    ok('asked-once survives a reload', await pg.locator('#inst').isHidden() && await pg.evaluate(() => prof.inst === 1));
    ok('the flag is saved', await pg.evaluate(() => JSON.parse(localStorage.getItem('pixelchess.v1')).inst === 1));
    await pg.context().close();
  }
  // iOS never fires beforeinstallprompt: the share-hint path
  {
    const pg = await mk(seed(3), { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    ok('iOS after 3 games: offer appears without the event', await pg.locator('#inst').isVisible());
    await pg.click('#inst');
    ok('iOS tap swaps in the share instructions', /SHARE/.test(await pg.locator('#inst').innerText()));
    ok('iOS tap also counts as asked', await pg.evaluate(() => prof.inst === 1));
    await pg.context().close();
  }
  // appinstalled removes the offer for good
  {
    const pg = await mk(seed(3));
    await fire(pg);
    await pg.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    ok('installing the app removes the offer', await pg.locator('#inst').isHidden() && await pg.evaluate(() => prof.inst === 1));
    await pg.context().close();
  }
  await br.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})();
