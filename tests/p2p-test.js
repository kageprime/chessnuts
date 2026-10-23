// P2P loopback test: real WebRTC handshake over local HTTP with an in-memory
// signal stub (same REST shape as api/signal.js), moves both ways, sync check.
// Run: node tests/p2p-test.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
(async () => {
  let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
  const root = path.join(__dirname, '..');
  const sig = {}, qwait = {}, qpawn = {};
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
  const srv = http.createServer((q, s) => {
    const u = new URL(q.url, 'http://x');
    if (u.pathname === '/api/queue') {
      let body = '';
      q.on('data', c => { body += c; });
      q.on('end', () => {
        const b = JSON.parse(body || '{}');
        s.writeHead(200, { 'Content-Type': 'application/json' });
        const tick = qpawn[b.pid];
        if (tick) { delete qpawn[b.pid]; s.end(JSON.stringify({ ok: true, paired: true, room: tick.room, side: tick.side, opp: tick.opp })); return; }
        const now = Date.now();
        let best = null, bestD = 401;
        for (const p in qwait) {
          const e = qwait[p];
          if (p === b.pid) continue;
          if (now - e.t > 90000) { delete qwait[p]; continue; }
          if (e.b !== b.blitz) continue;
          const d = Math.abs(e.xp - b.xp);
          if (d <= 400 && d < bestD) { best = p; bestD = d; }
        }
        if (best) {
          const foe = qwait[best]; delete qwait[best];
          const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
          let room = 'QM'; while (room.length < 4) room += A[Math.random() * A.length | 0];
          qpawn[best] = { room, side: 'w', opp: { n: b.name, xp: b.xp } };
          s.end(JSON.stringify({ ok: true, paired: true, room, side: 'b', opp: { n: foe.n, xp: foe.xp } }));
          return;
        }
        qwait[b.pid] = { n: b.name, xp: b.xp, b: b.blitz, t: now };
        s.end(JSON.stringify({ ok: true, waiting: true, q: Object.keys(qwait).length }));
      });
      return;
    }
    if (u.pathname === '/api/turn') {
      s.writeHead(200, { 'Content-Type': 'application/json' });
      s.end(JSON.stringify({ ok: true, fallback: true, iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }));
      return;
    }
    if (u.pathname === '/api/signal') {
      let body = '';
      q.on('data', c => { body += c; });
      q.on('end', () => {
        s.writeHead(200, { 'Content-Type': 'application/json' });
        if (q.method === 'GET') {
          const room = u.searchParams.get('room'), since = +(u.searchParams.get('since') || 0);
          const all = sig[room] || [];
          s.end(JSON.stringify({ ok: true, msgs: all.slice(since), next: all.length }));
        } else {
          const { room, msg } = JSON.parse(body);
          (sig[room] = sig[room] || []).push(JSON.stringify(msg));
          s.end(JSON.stringify({ ok: true }));
        }
      });
      return;
    }
    const f = path.join(root, decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html');
    fs.readFile(f, (e, d) => {
      if (e) { s.writeHead(404); s.end(); return; }
      s.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
      s.end(d);
    });
  });
  await new Promise(r => srv.listen(8902, r));
  const br = await chromium.launch();
  const H = await br.newPage({ viewport: { width: 390, height: 780 } });
  const G = await br.newPage({ viewport: { width: 390, height: 780 } });
  const errs = [];
  H.on('pageerror', e => errs.push('H: ' + e.message));
  G.on('pageerror', e => errs.push('G: ' + e.message));
  await H.goto('http://localhost:8902/chess/index.html');
  await G.goto('http://localhost:8902/chess/index.html');
  await H.click('#onl');
  await H.click('#neth');
  await H.waitForFunction(() => /CODE/.test(document.querySelector('#netmsg').textContent), null, { timeout: 15000 });
  const code = ((await H.locator('#netmsg').innerText()).match(/CODE ([A-Z0-9]{4})/) || [])[1];
  ok('host shows room code', !!code);
  await G.click('#onl');
  await G.locator('#netcode').fill(code || 'XXXX');
  await G.click('#netj');
  await H.waitForFunction(() => p2p && p2p.connected, null, { timeout: 30000 }).catch(() => {});
  await G.waitForFunction(() => p2p && p2p.connected, null, { timeout: 30000 }).catch(() => {});
  const st = await Promise.all([H, G].map(p => p.evaluate(() => ({ c: !!(p2p && p2p.connected), g: gmode, side: p2p && p2p.side }))));
  ok('both linked', st[0].c && st[1].c, JSON.stringify(st));
  ok('sides split white/black', st[0].side === 'w' && st[1].side === 'b' && st[0].g === 'online' && st[1].g === 'online');
  await H.evaluate(() => { fx = false; play(6, 4, 4, 4, 'Q'); });
  await G.waitForFunction(() => document.querySelector('#rb').textContent.includes('e4'), null, { timeout: 8000 }).catch(() => {});
  ok('guest receives e4', await G.evaluate(() => b[4][4] === 'wP'));
  await G.evaluate(() => { fx = false; play(1, 4, 3, 4, 'Q'); });
  await H.waitForFunction(() => (document.querySelectorAll('#rb span:not(.em)') || []).length >= 2, null, { timeout: 8000 }).catch(() => {});
  const eq = await Promise.all([H, G].map(p => p.evaluate(() => JSON.stringify(b.map(r => r.map(p => p))))));
  ok('boards in sync after e4 e5', eq[0] === eq[1]);
  const before = eq[1];
  await G.evaluate(() => netOn({ t: 'mv', m: [6, 4, 4, 4] }));
  await G.waitForTimeout(300);
  ok('illegal remote move ignored', (await G.evaluate(() => JSON.stringify(b.map(r => r.map(p => p))))) === before);
  // emotes over the data channel
  await H.click('#emo [data-em="GG"]');
  await G.waitForFunction(() => document.getElementById('bt').textContent.includes('FOE: GG'), null, { timeout: 5000 }).catch(() => { });
  ok('emote reaches the guest', await G.evaluate(() => document.getElementById('bt').textContent.includes('FOE: GG')));
  ok('emote echoes locally', await H.evaluate(() => document.getElementById('bt').textContent.includes('YOU: GG')));
  // quick match: two fresh tabs find each other through /api/queue
  const Q = await br.newPage({ viewport: { width: 390, height: 780 } });
  const R = await br.newPage({ viewport: { width: 390, height: 780 } });
  Q.on('pageerror', e => errs.push('Q: ' + e.message));
  R.on('pageerror', e => errs.push('R: ' + e.message));
  await Q.goto('http://localhost:8902/chess/index.html');
  await R.goto('http://localhost:8902/chess/index.html');
  await Q.click('#onl'); await Q.click('#netq');
  await R.click('#onl'); await R.click('#netq');
  await Q.waitForFunction(() => p2p && p2p.connected, null, { timeout: 40000 }).catch(() => { });
  await R.waitForFunction(() => p2p && p2p.connected, null, { timeout: 40000 }).catch(() => { });
  const qs = await Promise.all([Q, R].map(p => p.evaluate(() => ({ c: !!(p2p && p2p.connected), side: p2p && p2p.side, g: gmode }))));
  ok('quick match links both players', qs[0].c && qs[1].c, JSON.stringify(qs));
  ok('quick match splits sides', qs[0].side !== qs[1].side && qs[0].g === 'online' && qs[1].g === 'online', JSON.stringify(qs));
  await Q.close(); await R.close();
  // challenge link: hosting advertises ?room=CODE and the link auto-joins
  const C1 = await br.newPage({ viewport: { width: 390, height: 780 } });
  const C2 = await br.newPage({ viewport: { width: 390, height: 780 } });
  C1.on('pageerror', e => errs.push('C1: ' + e.message));
  C2.on('pageerror', e => errs.push('C2: ' + e.message));
  await C1.goto('http://localhost:8902/chess/index.html');
  await C1.click('#onl'); await C1.evaluate(() => { blitz = 3; blitzInc = 2; blitzLabel(); }); await C1.click('#neth');
  await C1.waitForFunction(() => /CODE [A-Z0-9]{4}/.test(document.getElementById('netmsg').textContent), null, { timeout: 8000 }).catch(() => { });
  const croom = await C1.evaluate(() => ((document.getElementById('netmsg').textContent.match(/CODE ([A-Z0-9]{4})/) || [])[1] || ''));
  ok('host advertises ?room= link', !!croom && await C1.evaluate(r => location.search.includes('room=' + r), croom), croom);
  await C2.goto('http://localhost:8902/chess/index.html?room=' + croom);
  await C2.waitForFunction(() => p2p && p2p.connected, null, { timeout: 40000 }).catch(() => { });
  await C1.waitForFunction(() => p2p && p2p.connected, null, { timeout: 40000 }).catch(() => { });
  const linkState = await Promise.all([C1, C2].map(p => p.evaluate(() => ({ c: !!(p2p && p2p.connected), side: p2p && p2p.side, g: gmode, code: document.getElementById('netcode').value, blitz, blitzInc, mw: document.getElementById('mw').textContent }))));
  ok('challenge link connects both', linkState[0].c && linkState[1].c && linkState[0].side !== linkState[1].side && linkState[0].g === 'online' && linkState[1].g === 'online', JSON.stringify(linkState));
  ok('challenge link prefills code', linkState[1].code === croom, JSON.stringify(linkState[1])); ok('guest syncs host blitz+inc control on join', linkState[1].blitz === 3 && linkState[1].blitzInc === 2 && linkState[1].mw === '3:00', JSON.stringify(linkState[1]));
  await C1.close(); await C2.close();
  console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
  console.log(fails || errs.length ? fails + ' FAILED' : 'all passed');
  await br.close();
  srv.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
