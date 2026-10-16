// Service worker test: shell precaches, the game boots offline from cache,
// and /api/* traffic is never cached. Run: node tests/sw-test.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
(async () => {
  let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
  const root = path.join(__dirname, '..');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
  const srv = http.createServer((q, s) => {
    const u = new URL(q.url, 'http://x');
    const f = path.join(root, decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html');
    fs.readFile(f, (e, d) => {
      if (e) { s.writeHead(404); s.end(); return; }
      s.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
      s.end(d);
    });
  });
  await new Promise(r => srv.listen(8903, r));
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 390, height: 780 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));

  await pg.goto('http://localhost:8903/chess/index.html');
  const ready = await pg.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active, () => false));
  ok('service worker activates', ready);

  const name = await pg.evaluate(() => caches.keys().then(ks => ks.find(k => k.startsWith('pixel-chess-v')) || ''));
  ok('shell cache created', !!name, name);
  const shell = await pg.evaluate(n => caches.open(n).then(c => c.keys()).then(ks => ks.map(k => new URL(k.url).pathname)), name);
  for (const f of ['/chess/index.html', '/shared/shell.js', '/shared/trophies.js', '/shared/vendor/PressStart2P-Regular.woff2', '/manifest.webmanifest', '/icon-192.png'])
    ok('precached ' + f, shell.includes(f), JSON.stringify(shell));

  await ctx.setOffline(true);
  await pg.goto('http://localhost:8903/');
  await pg.waitForFunction(() => document.activeElement && document.activeElement.dataset.m === '1', null, { timeout: 10000 }).catch(() => { });
  ok('offline: root redirects to the cached game', pg.url().endsWith('/chess/index.html'), pg.url());
  ok('offline: game boots to title', await pg.evaluate(() => document.activeElement && document.activeElement.dataset.m) === '1');
  await pg.keyboard.press('Enter');
  ok('offline: title responds to input', await pg.evaluate(() => document.querySelector('#s-opp').classList.contains('on')));
  const api = await pg.evaluate(() => fetch('/api/scores?board=streak').then(() => 'http', () => 'offline'));
  ok('offline: /api/ is not served from cache', api === 'offline', api);

  await ctx.setOffline(false);
  await br.close(); srv.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails || errs.length ? 1 : 0);
})();
