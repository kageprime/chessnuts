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

  // API: Scores (leaderboards mock or local store)
  if (u.pathname === '/api/scores') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.method === 'GET') {
        const board = u.searchParams.get('board') || 'streak';
        res.end(JSON.stringify({ ok: true, board, top: scores[board] || [] }));
      } else if (req.method === 'POST') {
        try {
          const s = JSON.parse(body || '{}');
          if (s.board) {
            (scores[s.board] = scores[s.board] || []).push({ n: s.name || 'YOU', v: s.value || 0, d: Date.now() });
          }
          res.end(JSON.stringify({ ok: true, rank: 1 }));
        } catch (e) {
          res.end(JSON.stringify({ ok: false, err: 'invalid json' }));
        }
      }
    });
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
