// Server integration test: tests server.js endpoints and static serving
const http = require('http');

(async () => {
  let fails = 0;
  const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };

  process.env.PORT = '8905';
  const srv = require('../server.js');

  const req = (path, method = 'GET', body = null) => new Promise((resolve, reject) => {
    const q = http.request({
      hostname: 'localhost',
      port: 8905,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    q.on('error', reject);
    if (body) q.write(JSON.stringify(body));
    q.end();
  });

  // Test static file serving
  const r1 = await req('/');
  ok('server serves index.html on root', r1.status === 200 && r1.body.includes('Pixel Chess'));

  const r2 = await req('/chess/index.html');
  ok('server serves chess/index.html', r2.status === 200 && r2.body.includes('PIXEL CHESS'));

  // Test signaling API
  const postRes = await req('/api/signal', 'POST', { room: 'TEST', msg: { t: 'offer', d: 'mock-sdp' } });
  ok('POST /api/signal succeeds', postRes.status === 200 && JSON.parse(postRes.body).ok === true);

  const getRes = await req('/api/signal?room=TEST&since=0');
  const getJson = JSON.parse(getRes.body);
  ok('GET /api/signal returns stored message', getRes.status === 200 && getJson.ok && getJson.msgs.length === 1);
  ok('stored message content matches', JSON.parse(getJson.msgs[0]).d === 'mock-sdp');

  // Test cursor
  const getCursorRes = await req('/api/signal?room=TEST&since=1');
  const getCursorJson = JSON.parse(getCursorRes.body);
  ok('cursor filters out seen messages', getCursorJson.msgs.length === 0 && getCursorJson.next === 1);

  // quick-match queue pairs two players
  const q1 = JSON.parse((await req('/api/queue', 'POST', { pid: 'aa11aa11', name: 'A', xp: 100, blitz: 0 })).body);
  ok('queue first player waits', q1.ok === true && q1.waiting === true, JSON.stringify(q1));
  const q2 = JSON.parse((await req('/api/queue', 'POST', { pid: 'bb22bb22', name: 'B', xp: 200, blitz: 0 })).body);
  ok('queue pairs second player', q2.paired === true && q2.side === 'b' && /^[A-Z0-9]{4}$/.test(q2.room || ''), JSON.stringify(q2));
  const q3 = JSON.parse((await req('/api/queue', 'POST', { pid: 'aa11aa11', name: 'A', xp: 100, blitz: 0 })).body);
  ok('queue ticket for first player', q3.paired === true && q3.side === 'w' && q3.room === q2.room, JSON.stringify(q3));
  const qt = JSON.parse((await req('/api/turn')).body);
  ok('turn reports stun fallback', qt.ok === true && qt.iceServers.length >= 1, JSON.stringify(qt));

  srv.close();
  console.log(fails ? fails + ' FAILED' : 'all server tests passed');
  process.exit(fails ? 1 : 0);
})();
