// Pixel Chess online Elo rating (Vercel serverless, Upstash Redis via REST).
// GET  ?pid=xxxxxxxx -> {ok, elo, rank, rec:{w,l,d}, top:[{pid,n,v,me}]}
// POST {pid,name,opp,oppName,result:'w'|'l'|'d',gid} -> rates the submitter only
//      (the opponent reports their own side), K=32, start 1000. `gid` makes a
//      report idempotent so a duplicate submit can never double-count a game.
// Ratings are separate from arcade XP: they only move on online games.
const ZKEY = 'pc:elo', NKEY = 'pc:eloname', RKEY = 'pc:elorec';
const BASE = 1000, K = 32;
const clampName = n => (typeof n === 'string' ? n : '').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 12) || 'YOU';
const pidOk = p => /^[0-9a-f]{8}$/.test(p || '');
const getKvUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REDIS_REST_URL || '';
const getKvToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_REST_TOKEN || '';

async function kv(path, init) {
  const r = await fetch(getKvUrl() + '/' + path, Object.assign(
    { headers: { Authorization: 'Bearer ' + getKvToken() } }, init));
  if (!r.ok) throw new Error('kv ' + r.status);
  return r.json();
}
const ip = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
const pairs = arr => { const o = {}; for (let i = 0; i + 1 < arr.length; i += 2) o[arr[i]] = arr[i + 1]; return o; };

// Pure rating math (unit-tested).
const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
const nextRating = (r, e, s) => Math.max(100, Math.min(3000, Math.round(r + K * (s - e))));
const scoreOf = r => r === 'w' ? 1 : r === 'l' ? 0 : 0.5;
const flip = r => r === 'w' ? 'l' : r === 'l' ? 'w' : 'd';

async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const who = String((req.query || {}).pid || '');
      if (who && !pidOk(who)) return res.status(400).json({ ok: false, err: 'bad pid' });
      const lim = encodeURIComponent(ip(req));
      const rl = await kv('incr/pc:rle:' + lim);
      await kv('expire/pc:rle:' + lim + '/60');
      if ((rl.result | 0) > 240) return res.status(429).json({ ok: false, err: 'slow down' });
      const d = await kv('zrevrange/' + ZKEY + '/0/9/WITHSCORES');
      const arr = d.result || [], pids = [];
      for (let i = 0; i + 1 < arr.length; i += 2) pids.push([arr[i], +arr[i + 1] || 0]);
      const names = pairs(((await kv('hgetall/' + NKEY)).result) || []);
      const top = pids.map(([p, v]) => ({ pid: p, n: names[p] || '???', v, me: p === who }));
      let elo = BASE, rank = 0, rec = { w: 0, l: 0, d: 0 };
      if (pidOk(who)) {
        const z = await kv('zscore/' + ZKEY + '/' + who);
        if (z.result !== null && z.result !== undefined) elo = Math.round(+z.result);
        const rk = await kv('zrevrank/' + ZKEY + '/' + who);
        if (rk.result !== null && rk.result !== undefined) rank = (rk.result | 0) + 1;
        const rr = pairs(((await kv('hgetall/' + RKEY + ':' + who)).result) || []);
        rec = { w: +(rr.w || 0), l: +(rr.l || 0), d: +(rr.d || 0) };
      }
      return res.status(200).json({ ok: true, elo, rank, rec, top });
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      if (!pidOk(b.pid)) return res.status(400).json({ ok: false, err: 'bad pid' });
      if (b.opp && !pidOk(b.opp)) return res.status(400).json({ ok: false, err: 'bad opp' });
      if (!['w', 'l', 'd'].includes(b.result)) return res.status(400).json({ ok: false, err: 'bad result' });
      const lim = encodeURIComponent(ip(req));
      const rl = await kv('incr/pc:rle:' + lim);
      await kv('expire/pc:rle:' + lim + '/60');
      if ((rl.result | 0) > 240) return res.status(429).json({ ok: false, err: 'slow down' });
      const name = clampName(b.name);
      const zm = await kv('zscore/' + ZKEY + '/' + b.pid);
      const mine = (zm.result !== null && zm.result !== undefined) ? +zm.result : BASE;
      // one game id = one rating change, no matter how many retries arrive
      const gid = String(b.gid || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24);
      if (gid) {
        const g = await kv('incr/pc:elog:' + b.pid + ':' + gid);
        await kv('expire/pc:elog:' + b.pid + ':' + gid + '/7200');
        if ((g.result | 0) > 1) {
          const rr0 = pairs(((await kv('hgetall/' + RKEY + ':' + b.pid)).result) || []);
          return res.status(200).json({ ok: true, elo: Math.round(mine), delta: 0, dup: true,
            rec: { w: +(rr0.w || 0), l: +(rr0.l || 0), d: +(rr0.d || 0) }, opp: null });
        }
      }
      const opp = b.opp || '';
      let foe = BASE;
      if (opp) {
        const zf = await kv('zscore/' + ZKEY + '/' + opp);
        foe = (zf.result !== null && zf.result !== undefined) ? +zf.result : BASE;
      }
      const elo = nextRating(mine, expected(mine, foe), scoreOf(b.result));
      await kv('zadd/' + ZKEY + '/' + elo + '/' + b.pid, { method: 'POST' });
      await kv('hset/' + NKEY + '/' + b.pid + '/' + encodeURIComponent(name), { method: 'POST' });
      await kv('hincrby/' + RKEY + ':' + b.pid + '/' + b.result + '/1', { method: 'POST' });
      const rr = pairs(((await kv('hgetall/' + RKEY + ':' + b.pid)).result) || []);
      return res.status(200).json({ ok: true, elo, delta: elo - mine,
        rec: { w: +(rr.w || 0), l: +(rr.l || 0), d: +(rr.d || 0) },
        opp: opp ? { elo: Math.round(foe), delta: 0 } : null });
    }
    return res.status(405).json({ ok: false, err: 'method' });
  } catch (e) {
    return res.status(500).json({ ok: false, err: 'store unavailable' });
  }
}
module.exports = handler;
module.exports.expected = expected;
module.exports.nextRating = nextRating;
module.exports.scoreOf = scoreOf;
module.exports.flip = flip;
module.exports.BASE = BASE;
