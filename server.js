// Pixel Chess standalone HTTP and signaling server.
// Runs the retro chess game locally with peer-to-peer WebRTC signaling and leaderboards.
// Usage: node server.js [port]
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = __dirname;

// Load .env or .env.local if present
['.env', '.env.local'].forEach(f => {
  const p = path.join(root, f);
  if (fs.existsSync(p)) {
    try {
      fs.readFileSync(p, 'utf8').split('\n').forEach(l => {
        const m = l.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
        }
      });
    } catch (_) {}
  }
});

const PORT = parseInt(process.env.PORT || process.argv[2] || '3000', 10);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

// In-memory signal store (same REST shape as api/signal.js)
const sig = {};
const sigTimes = {};

// Clean up rooms older than 10 minutes every minute
setInterval(() => {
  const now = Date.now();
  for (const r in sigTimes) {
    if (now - sigTimes[r] > 600000) {
      delete sig[r];
      delete sigTimes[r];
    }
  }
}, 60000);

// In-memory scores store for local testing
const scores = {};
const replays = {};

// In-memory quick-match queue (single process, so pairing has no races)
const queue = {}, pawned = {};
const mqRoom = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 4; i++) s += A[Math.random() * A.length | 0]; return s; };

// In-memory online ratings for local play (mirrors api/elo.js)
const elo = {}, eloname = {}, elorec = {}, elog = {};

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  // API: Signaling
  if (u.pathname === '/api/signal') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      if (req.method === 'OPTIONS') {
        res.end();
        return;
      }
      if (req.method === 'GET') {
        const room = (u.searchParams.get('room') || '').toUpperCase();
        const since = Math.max(0, parseInt(u.searchParams.get('since') || '0', 10) || 0);
        const all = sig[room] || [];
        res.end(JSON.stringify({ ok: true, msgs: all.slice(since), next: all.length }));
      } else if (req.method === 'POST') {
        try {
          const { room, msg } = JSON.parse(body || '{}');
          if (room && msg) {
            const rm = room.toUpperCase();
            (sig[rm] = sig[rm] || []).push(typeof msg === 'string' ? msg : JSON.stringify(msg));
            sigTimes[rm] = Date.now();
            res.end(JSON.stringify({ ok: true }));
          } else {
            res.end(JSON.stringify({ ok: false, err: 'bad body' }));
          }
        } catch (e) {
          res.end(JSON.stringify({ ok: false, err: 'invalid json' }));
        }
      } else {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, err: 'method' }));
      }
    });
    return;
  }

  // API: Scores (leaderboards mock or local store, with ghost replays)
  if (u.pathname === '/api/scores') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const asc = b => /^(fast|mate):/.test(b);
      const sortedTop = b => (scores[b] || []).slice().sort((x, y) => asc(b) ? x.v - y.v : y.v - x.v).slice(0, 5);
      if (req.method === 'GET') {
        const rb = u.searchParams.get('replay');
        if (rb) { res.end(JSON.stringify({ ok: true, replay: replays[rb] || null })); return; }
        const board = u.searchParams.get('board') || 'streak';
        const top = sortedTop(board), rep = replays[board];
        res.end(JSON.stringify(rep && asc(board)
          ? { ok: true, board, top, ghost: { n: rep.n, moves: rep.moves, ms: rep.ms } }
          : { ok: true, board, top }));
      } else if (req.method === 'POST') {
        try {
          const s = JSON.parse(body || '{}');
          let rank = 1;
          if (s.board) {
            const en = { n: s.name || 'YOU', v: s.value || 0, d: Date.now() };
            (scores[s.board] = scores[s.board] || []).push(en);
            const top = sortedTop(s.board);
            scores[s.board] = top;
            rank = Math.max(1, top.indexOf(en) + 1);
            if (asc(s.board) && top[0] === en) {
              const kind = s.board.indexOf('mate:') === 0 ? 'mate' : 'fast';
              replays[s.board] = {
                n: en.n, opp: s.opp || '', san: s.san || '',
                moves: kind === 'mate' ? s.value : Math.max(1, Math.ceil((s.plies | 0) / 2)),
                ms: kind === 'fast' ? s.value : s.ms | 0,
                board: s.board, d: Date.now(),
              };
            }
          }
          res.end(JSON.stringify({ ok: true, rank }));
        } catch (e) {
          res.end(JSON.stringify({ ok: false, err: 'invalid json' }));
        }
      }
    });
    return;
  }

  // API: Quick-match queue (same contract as api/queue.js)
  if (u.pathname === '/api/queue') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      try {
        const b = JSON.parse(body || '{}');
        if (!/^[0-9a-f]{8}$/.test(b.pid || '')) { res.end(JSON.stringify({ ok: false, err: 'bad pid' })); return; }
        const xp = Number.isInteger(b.xp) && b.xp >= 0 ? b.xp : 0;
        const blitz = [0, 1, 3, 5, 10, 30, 50, 32, 53].includes(b.blitz) ? b.blitz : 0;
        const name = String(b.name || 'YOU').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 12) || 'YOU';
        const tick = pawned[b.pid];
        if (tick) {
          delete pawned[b.pid];
          res.end(JSON.stringify({ ok: true, paired: true, room: tick.room, side: tick.side, opp: tick.opp }));
          return;
        }
        const now = Date.now();
        let best = null, bestD = 401;
        for (const p in queue) {
          const e = queue[p];
          if (p === b.pid) continue;
          if (now - e.t > 90000) { delete queue[p]; continue; }
          if (e.b !== blitz) continue;
          const d = Math.abs(e.xp - xp);
          if (d <= 400 && d < bestD) { best = p; bestD = d; }
        }
        if (best) {
          const foe = queue[best];
          delete queue[best];
          const room = mqRoom();
          pawned[best] = { room, side: 'w', opp: { n: name, xp } };
          res.end(JSON.stringify({ ok: true, paired: true, room, side: 'b', opp: { n: foe.n, xp: foe.xp } }));
          return;
        }
        queue[b.pid] = { n: name, xp, b: blitz, t: now };
        res.end(JSON.stringify({ ok: true, waiting: true, q: Object.keys(queue).length }));
      } catch (e) {
        res.end(JSON.stringify({ ok: false, err: 'invalid json' }));
      }
    });
    return;
  }

  // API: Online ratings (same contract as api/elo.js, single process)
  if (u.pathname === '/api/elo') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
      const nextR = (r, e, s) => Math.max(100, Math.min(3000, Math.round(r + 32 * (s - e))));
      const rec = p => elorec[p] || { w: 0, l: 0, d: 0 };
      if (req.method === 'GET') {
        const who = (u.searchParams.get('pid') || '').toLowerCase();
        const row = Object.keys(elo).map(p => ({ pid: p, n: eloname[p] || '???', v: elo[p] })).sort((a, b) => b.v - a.v);
        const top = row.slice(0, 10).map(e => ({ pid: e.pid, n: e.n, v: e.v, me: e.pid === who }));
        const rank = row.findIndex(e => e.pid === who);
        res.end(JSON.stringify({ ok: true, elo: who && elo[who] ? elo[who] : 1000, rank: rank < 0 ? 0 : rank + 1, rec: rec(who), top }));
        return;
      }
      if (req.method === 'POST') {
        try {
          const b = JSON.parse(body || '{}');
          if (!/^[0-9a-f]{8}$/.test(b.pid || '')) { res.end(JSON.stringify({ ok: false, err: 'bad pid' })); return; }
          if (!['w', 'l', 'd'].includes(b.result)) { res.end(JSON.stringify({ ok: false, err: 'bad result' })); return; }
          const name = String(b.name || 'YOU').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 12) || 'YOU';
          const gid = String(b.gid || '');
          if (gid) {
            const k = b.pid + ':' + gid;
            if (elog[k]) { res.end(JSON.stringify({ ok: true, elo: elo[b.pid] || 1000, delta: 0, dup: true, rec: rec(b.pid), opp: null })); return; }
            elog[k] = 1;
          }
          const mine = elo[b.pid] || 1000;
          const foe = (b.opp && elo[b.opp]) || 1000;
          const s = b.result == 'w' ? 1 : b.result == 'l' ? 0 : 0.5;
          const ne = nextR(mine, expected(mine, foe), s);
          elo[b.pid] = ne; eloname[b.pid] = name;
          const rr = elorec[b.pid] = elorec[b.pid] || { w: 0, l: 0, d: 0 }; rr[b.result]++;
          res.end(JSON.stringify({ ok: true, elo: ne, delta: ne - mine, rec: rr, opp: b.opp ? { elo: Math.round(foe), delta: 0 } : null }));
        } catch (e) {
          res.end(JSON.stringify({ ok: false, err: 'invalid json' }));
        }
        return;
      }
      res.end(JSON.stringify({ ok: false, err: 'method' }));
    });
    return;
  }

  // API: TURN credentials (LAN play needs no relay; mirror the Vercel STUN fallback)
  if (u.pathname === '/api/turn') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, fallback: true, iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })); return; } if (u.pathname === '/api/og' || u.pathname === '/api/share') { const fn = require(u.pathname === '/api/og' ? './api/og.js' : './api/share.js'); const query = Object.fromEntries(u.searchParams.entries()); const hdrs = {}; let code = 200; const mockRes = { setHeader: (k, v) => { hdrs[k] = v; }, status: c => { code = c; return mockRes; }, json: o => { hdrs['Content-Type'] = 'application/json'; res.writeHead(code, hdrs); res.end(JSON.stringify(o)); }, send: b => { res.writeHead(code, hdrs); res.end(b); } }; fn({ method: req.method, query, headers: req.headers }, mockRes);
    return;
  }

  // Static file serving
  let reqPath = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (!reqPath || reqPath === '') reqPath = 'index.html';
  const filePath = path.join(root, reqPath);

  // Security: prevent path traversal outside root
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (stats && stats.isDirectory()) {
        const idx = path.join(filePath, 'index.html');
        if (fs.existsSync(idx)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(idx).pipe(res);
          return;
        }
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mime[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

srv.listen(PORT, () => {
  const ifaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  console.log('\n==================================================');
  console.log('       PIXEL CHESS - RETRO ARCADE SERVER          ');
  console.log('==================================================');
  console.log(`  > Local:    http://localhost:${PORT}`);
  if (addresses.length) {
    addresses.forEach(ip => {
      console.log(`  > Network:  http://${ip}:${PORT}`);
    });
  }
  console.log('  > P2P Signaling: ACTIVE (/api/signal)');
  console.log('==================================================\n');
});

module.exports = srv;
