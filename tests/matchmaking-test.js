// Quick-match queue + TURN + Elo API tests. Run: node tests/matchmaking-test.js
// api/queue.js, api/turn.js, and api/elo.js run against a tiny in-memory Redis REST emulator.
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
process.env.KV_REST_API_URL = 'https://x';
process.env.KV_REST_API_TOKEN = 'y';
delete process.env.CLOUDFLARE_TURN_KEY_ID;
delete process.env.CLOUDFLARE_TURN_API_TOKEN;

// ---- tiny Redis REST emulator: hgetall/hset/hdel/del/incr/expire ----
const hashes = {}, counters = {}, zsets = {};
global.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith('https://rtc.live.cloudflare.com/')) {
    if (u.includes('badkey')) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, json: async () => ({ iceServers: { urls: ['turn:relay.example.com:3478?transport=udp', 'turns:relay.example.com:443'], username: 'u1', credential: 'c1' } }) };
  }
  const p = u.replace('https://x/', '').split('/');
  const cmd = p[0], key = decodeURIComponent(p[1] || '');
  const res = v => ({ ok: true, json: async () => ({ result: v }) });
  if (cmd === 'incr') { counters[key] = (counters[key] || 0) + 1; return res(counters[key]); }
  if (cmd === 'expire') return res(1);
  if (cmd === 'zadd') { const z = zsets[key] = zsets[key] || new Map(); z.set(decodeURIComponent(p[3]), +p[2]); return res(1); }
  if (cmd === 'zscore') { const z = zsets[key]; const v = z && z.get(decodeURIComponent(p[2])); return res(v === undefined ? null : String(v)); }
  if (cmd === 'zrevrank') { const i = [...(zsets[key] || new Map()).entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).indexOf(decodeURIComponent(p[2])); return res(i < 0 ? null : i); }
  if (cmd === 'zrevrange') { const arr = [...(zsets[key] || new Map()).entries()].sort((a, b) => b[1] - a[1]); const win = arr.slice(+p[2], (p[3] | 0) + 1); return res((p[4] || '').toUpperCase() === 'WITHSCORES' ? win.flatMap(e => [e[0], String(e[1])]) : win.map(e => e[0])); }
  if (cmd === 'hincrby') { const h = hashes[key] = hashes[key] || {}; const f = decodeURIComponent(p[2]); h[f] = (parseInt(h[f] || '0', 10) || 0) + (+p[3] || 0); return res(h[f]); }
  if (cmd === 'hgetall') return res(Object.entries(hashes[key] || {}).flat());
  if (cmd === 'hset') {
    const h = hashes[key] = hashes[key] || {};
    const segs = p.slice(2).map(decodeURIComponent);
    for (let i = 0; i + 1 < segs.length; i += 2) h[segs[i]] = segs[i + 1];
    return res(segs.length >> 1);
  }
  if (cmd === 'hdel') { const h = hashes[key] || {}; let n = 0; for (const f of p.slice(2).map(decodeURIComponent)) if (f in h) { delete h[f]; n++; } return res(n); }
  if (cmd === 'del') { const had = key in hashes; delete hashes[key]; return res(had ? 1 : 0); }
  return { ok: false, status: 500, json: async () => ({}) };
};
const reset = () => { for (const k in hashes) delete hashes[k]; for (const k in counters) delete counters[k]; for (const k in zsets) delete zsets[k]; };

const q = require('../api/queue.js');
const turn = require('../api/turn.js');
const elo = require('../api/elo.js');
const res = () => { const r = {}; r.status = (c) => (r.code = c, r); r.json = (o) => (r.body = o, r); return r; };
const join = (body, headers = {}) => { const r = res(); return q({ method: 'POST', body, headers }, r).then(() => r); };

(async () => {
  // ---- pure helpers ----
  eq('name clamped', q.clampName('a!@# $%^b'), 'a b');
  eq('empty name defaults', q.clampName(''), 'YOU');
  const ent = {
    p1: JSON.stringify({ n: 'A', xp: 500, b: 0, t: 1000 }),
    p2: JSON.stringify({ n: 'B', xp: 700, b: 0, t: 1000 }),
    p3: JSON.stringify({ n: 'C', xp: 500, b: 3, t: 1000 }),
  };
  eq('bestMatch closest xp', q.bestMatch(ent, 'me', 600, 0, 2000), 'p1');
  eq('bestMatch respects blitz', q.bestMatch(ent, 'me', 500, 3, 2000), 'p3');
  eq('stale finds old', q.stale({ a: JSON.stringify({ t: 1 }), b: JSON.stringify({ t: Date.now() }) }, Date.now()), ['a']);
  eq('stale flags corrupt', q.stale({ c: 'not json' }, Date.now()), ['c']);

  // ---- validation ----
  let r = res();
  await q({ method: 'GET', headers: {} }, r);
  eq('GET rejected', r.code, 405);
  r = res();
  await q({ method: 'POST', body: { pid: 'nope' }, headers: {} }, r);
  eq('bad pid', r.code, 400);

  // ---- happy path pairing ----
  reset();
  let a = await join({ pid: 'aa11aa11', name: 'Alice', xp: 500, blitz: 0 });
  eq('first joiner waits', [a.code, a.body.ok, a.body.waiting], [200, true, true]);
  const b = await join({ pid: 'bb22bb22', name: 'Bob', xp: 700, blitz: 0 });
  const room = b.body.room;
  eq('second joiner pairs', [b.code, b.body.paired, b.body.side, /^[A-Z0-9]{4}$/.test(room || ''), b.body.opp.n], [200, true, 'b', true, 'Alice']);
  a = await join({ pid: 'aa11aa11', name: 'Alice', xp: 500, blitz: 0 });
  eq('first joiner gets ticket', [a.body.paired, a.body.side, a.body.room === room, a.body.opp.n], [true, 'w', true, 'Bob']);
  a = await join({ pid: 'aa11aa11', name: 'Alice', xp: 500, blitz: 0 });
  eq('ticket consumed once', [a.body.paired, a.body.waiting], [undefined, true]);

  // ---- blitz partition ----
  reset();
  await join({ pid: 'cc33cc33', name: 'C', xp: 500, blitz: 32 });
  const d = await join({ pid: 'dd44dd44', name: 'D', xp: 500, blitz: 0 });
  eq('blitz mismatch does not pair', d.body.waiting, true);
  const d2 = await join({ pid: 'ee44ee44', name: 'D2', xp: 500, blitz: 32 });
  eq('matching 3+2 blitz code pairs', [d2.body.paired, d2.body.opp.n], [true, 'C']);

  // ---- xp window ----
  reset();
  await join({ pid: 'ee55ee55', name: 'E', xp: 100, blitz: 0 });
  const f = await join({ pid: 'ff66ff66', name: 'F', xp: 1000, blitz: 0 });
  eq('xp gap blocks pairing', f.body.waiting, true);
  const g = await join({ pid: '11771177', name: 'G', xp: 490, blitz: 0 });
  eq('xp within window pairs', [g.body.paired, g.body.side, g.body.opp.n], [true, 'b', 'E']);

  // ---- stale prune ----
  reset();
  hashes['pc:queue'] = { '99999999': JSON.stringify({ n: 'Old', xp: 500, b: 3, t: Date.now() - 200000 }) };
  const h = await join({ pid: '12881288', name: 'New', xp: 500, blitz: 3 });
  eq('stale entry pruned, new waits', [h.body.waiting, '99999999' in hashes['pc:queue']], [true, false]);

  // ---- rate limit ----
  reset();
  counters['pc:rlq:unknown'] = 999;
  const rl = await join({ pid: 'aa11aa11', name: 'A', xp: 1, blitz: 0 });
  eq('rate limited', rl.code, 429);

  // ---- store down ----
  const okFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const down = await join({ pid: 'aa11aa11', name: 'A', xp: 1, blitz: 0 });
  eq('store down 500', [down.code, down.body.err], [500, 'store unavailable']);
  global.fetch = okFetch;

  // ---- TURN ----
  let t = res();
  await turn({ method: 'POST', headers: {} }, t);
  eq('turn GET only', t.code, 405);
  t = res();
  await turn({ method: 'GET', headers: {} }, t);
  eq('turn stun fallback without env', [t.code, t.body.ok, t.body.fallback, t.body.iceServers.length], [200, true, true, 3]);
  process.env.CLOUDFLARE_TURN_KEY_ID = 'key1';
  process.env.CLOUDFLARE_TURN_API_TOKEN = 'tok1';
  t = res();
  await turn({ method: 'GET', headers: {} }, t);
  eq('turn relays from cloudflare', [t.body.ok, t.body.iceServers[0].credential, t.body.iceServers[0].urls.length, t.body.iceServers.length], [true, 'c1', 2, 4]);
  process.env.CLOUDFLARE_TURN_KEY_ID = 'badkey';
  t = res();
  await turn({ method: 'GET', headers: {} }, t);
  eq('turn degrades on cf failure', [t.body.ok, t.body.fallback, t.body.iceServers.length], [true, true, 3]);

  // ---- Elo: pure math ----
  eq('elo expected even', elo.expected(1000, 1000), 0.5);
  eq('elo next win K32', elo.nextRating(1000, 0.5, 1), 1016);
  eq('elo next loss', elo.nextRating(1000, 0.5, 0), 984);
  eq('elo draw score', elo.scoreOf('d'), 0.5);
  eq('elo flip', elo.flip('w'), 'l');

  // ---- Elo: handler ----
  reset();
  r = res();
  await elo({ method: 'POST', body: { pid: 'aa11aa11', name: 'Alice', result: 'w', gid: 'g1' }, headers: {} }, r);
  eq('elo first win vs base', [r.code, r.body.elo, r.body.delta, r.body.rec.w], [200, 1016, 16, 1]);
  r = res();
  await elo({ method: 'POST', body: { pid: 'aa11aa11', name: 'Alice', result: 'w', gid: 'g1' }, headers: {} }, r);
  eq('elo game id dedupes', [r.body.dup, r.body.elo, r.body.delta], [true, 1016, 0]);
  r = res();
  await elo({ method: 'POST', body: { pid: 'bb22bb22', name: 'Bob', opp: 'aa11aa11', oppName: 'Alice', result: 'l', gid: 'g2' }, headers: {} }, r);
  eq('elo rated loss drops', [r.body.elo < 1000, r.body.rec.l], [true, 1]);
  r = res();
  await elo({ method: 'GET', query: { pid: 'aa11aa11' }, headers: {} }, r);
  eq('elo get own + board', [r.body.elo, r.body.rank, r.body.rec.w, r.body.top[0].n, r.body.top[0].me], [1016, 1, 1, 'Alice', true]);
  r = res();
  await elo({ method: 'GET', query: { pid: 'zz' }, headers: {} }, r);
  eq('elo bad pid', r.code, 400);
  r = res();
  await elo({ method: 'POST', body: { pid: 'aa11aa11', result: 'x', gid: 'g3' }, headers: {} }, r);
  eq('elo bad result', r.code, 400);
  r = res();
  await elo({ method: 'POST', body: { pid: 'aa11aa11', opp: 'nope', result: 'w', gid: 'g4' }, headers: {} }, r);
  eq('elo bad opp', r.code, 400);
  r = res();
  await elo({ method: 'PUT', headers: {} }, r);
  eq('elo method', r.code, 405);
  const okFetch2 = global.fetch;
  global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  r = res();
  await elo({ method: 'GET', query: { pid: 'aa11aa11' }, headers: {} }, r);
  eq('elo store down 500', [r.code, r.body.err], [500, 'store unavailable']);
  global.fetch = okFetch2;

  console.log(fail ? `\n${fail} FAILED` : '\nall passed');
  process.exit(fail ? 1 : 0);
})();
