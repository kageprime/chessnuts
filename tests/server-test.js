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

  // online Elo ratings
  const e1 = JSON.parse((await req('/api/elo', 'POST', { pid: 'aa11aa11', name: 'A', result: 'w', gid: 'g1' })).body);
  ok('elo win recorded', e1.ok === true && e1.elo === 1016 && e1.rec.w === 1, JSON.stringify(e1));
  const e2 = JSON.parse((await req('/api/elo', 'POST', { pid: 'aa11aa11', name: 'A', result: 'w', gid: 'g1' })).body);
  ok('elo dedupes same game id', e2.dup === true && e2.delta === 0, JSON.stringify(e2));
  const e3 = JSON.parse((await req('/api/elo?pid=aa11aa11')).body);
  ok('elo get returns rating and board', e3.ok === true && e3.elo === 1016 && e3.rank === 1 && e3.top.length === 1 && e3.top[0].me === true, JSON.stringify(e3));

  // world scores with ghost replays
  const sc1 = JSON.parse((await req('/api/scores', 'POST', { board: 'mate:moss', name: 'KAI', value: 5, plies: 11, ms: 40000, opp: 'moss', san: 'e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#' })).body);
  ok('scores post accepts the record', sc1.ok === true && sc1.rank === 1, JSON.stringify(sc1));
  const sc2 = JSON.parse((await req('/api/scores?board=mate:moss')).body);
  ok('board fetch advertises the ghost', sc2.ghost && sc2.ghost.n === 'KAI' && sc2.ghost.moves === 5, JSON.stringify(sc2));
  const sc3 = JSON.parse((await req('/api/scores?replay=mate:moss')).body);
  ok('replay fetch returns the stored line', sc3.ok === true && sc3.replay.san.includes('Qxf7#'), JSON.stringify(sc3));
  const sc4 = JSON.parse((await req('/api/scores', 'POST', { board: 'mate:moss', name: 'RIVAL', value: 9, plies: 19, ms: 20000, opp: 'moss', san: 'd4 d5 c4 e6' })).body);
  const sc5 = JSON.parse((await req('/api/scores?replay=mate:moss')).body);
  ok('a slower mate keeps the record line', sc4.rank === 2 && sc5.replay.n === 'KAI', JSON.stringify(sc5));

  // OG card & share landing page
  const ogRes = await req('/api/og?room=ABCD');
  ok('server serves /api/og PNG', ogRes.status === 200 && ogRes.headers['content-type'] === 'image/png' && ogRes.body.length > 500);
  const shRes = await req('/api/share?room=ABCD');
  ok('server serves /api/share HTML with og:image', shRes.status === 200 && shRes.body.includes('/api/og?room=ABCD') && shRes.body.includes('/chess/index.html?room=ABCD'));

  srv.close();
  console.log(fails ? fails + ' FAILED' : 'all server tests passed');
  process.exit(fails ? 1 : 0);
})();
