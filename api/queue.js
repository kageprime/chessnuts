// Pixel Chess quick-match queue (Vercel serverless, Upstash Redis via REST).
// POST {pid,name,xp,blitz} joins or re-polls the queue: returns {paired,room,side,opp}
// once a nearby-XP player is waiting, else {waiting}. The paired clients then run the
// normal offer/answer flow through /api/signal - this endpoint only seats the table.
const QUEUE = 'pc:queue';
const BLITZ = [0, 1, 3, 5, 10, 30, 50, 32, 53];
const XPRANGE = 400;
const STALE = 90000;
const ROOMS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const clampName = n => (typeof n === 'string' ? n : '').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 12) || 'YOU';
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
const mkRoom = () => { let s = ''; for (let i = 0; i < 4; i++) s += ROOMS[Math.random() * ROOMS.length | 0]; return s; };

// Pure: best waiting entry for a joiner (closest XP within range). ent: {pid: entryJson}
function bestMatch(ent, pid, xp, blitz, now) {
  let best = null, bestD = XPRANGE + 1;
  for (const p in ent) {
    if (p === pid) continue;
    let e; try { e = JSON.parse(ent[p]); } catch (_) { continue; }
    if (!e || e.b !== blitz) continue;
    if (now - Number(e.t || 0) > STALE) continue;
    const d = Math.abs((e.xp | 0) - xp);
    if (d <= XPRANGE && d < bestD) { best = p; bestD = d; }
  }
  return best;
}
// Pure: pids that must be pruned (older than STALE, or unreadable entries).
function stale(ent, now) {
  const out = [];
  for (const p in ent) {
    let e; try { e = JSON.parse(ent[p]); } catch (_) { out.push(p); continue; }
    if (!e || now - Number(e.t || 0) > STALE) out.push(p);
  }
  return out;
}

async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, err: 'method' });
    const b = req.body || {};
    if (!/^[0-9a-f]{8}$/.test(b.pid || '')) return res.status(400).json({ ok: false, err: 'bad pid' });
    const xp = Number.isInteger(b.xp) && b.xp >= 0 && b.xp <= 999999 ? b.xp : 0;
    const blitz = BLITZ.includes(b.blitz) ? b.blitz : 0;
    const name = clampName(b.name);
    const who = encodeURIComponent(ip(req));
    const rl = await kv('incr/pc:rlq:' + who);
    await kv('expire/pc:rlq:' + who + '/60');
    if ((rl.result | 0) > 180) return res.status(429).json({ ok: false, err: 'slow down' });

    // Matched on an earlier poll? Hand over the ticket and clear it.
    const mine = pairs(((await kv('hgetall/pc:pawned:' + b.pid)).result) || []);
    if (mine.room) {
      await kv('del/pc:pawned:' + b.pid, { method: 'POST' });
      return res.status(200).json({ ok: true, paired: true, room: mine.room,
        side: mine.side === 'w' ? 'w' : 'b', opp: { n: mine.on || '???', xp: +(mine.oxp || 0) } });
    }

    const ent = pairs(((await kv('hgetall/' + QUEUE)).result) || []);
    const now = Date.now();
    for (const p of stale(ent, now)) { await kv('hdel/' + QUEUE + '/' + p, { method: 'POST' }); delete ent[p]; }
    const foe = bestMatch(ent, b.pid, xp, blitz, now);
    if (foe) {
      // HDEL is the race arbitrer: only one joiner can claim a waiting player.
      const took = (await kv('hdel/' + QUEUE + '/' + foe, { method: 'POST' })).result | 0;
      if (took > 0) {
        const room = mkRoom();
        let f = {}; try { f = JSON.parse(ent[foe]); } catch (_) {}
        await kv('hset/pc:pawned:' + foe + '/room/' + room + '/side/w/on/' + encodeURIComponent(name) + '/oxp/' + xp, { method: 'POST' });
        await kv('expire/pc:pawned:' + foe + '/120', { method: 'POST' });
        await kv('hset/pc:pawned:' + b.pid + '/room/' + room + '/side/b/on/' + encodeURIComponent(f.n || '???') + '/oxp/' + (f.xp | 0), { method: 'POST' });
        await kv('expire/pc:pawned:' + b.pid + '/120', { method: 'POST' });
        return res.status(200).json({ ok: true, paired: true, room, side: 'b', opp: { n: f.n || '???', xp: f.xp | 0 } });
      }
      // lost the claim race - fall through and wait for the next round
    }
    await kv('hset/' + QUEUE + '/' + b.pid + '/' + encodeURIComponent(JSON.stringify({ n: name, xp, b: blitz, t: now })), { method: 'POST' });
    await kv('expire/' + QUEUE + '/180', { method: 'POST' });
    return res.status(200).json({ ok: true, waiting: true, q: Object.keys(ent).length + 1 });
  } catch (e) {
    return res.status(500).json({ ok: false, err: 'store unavailable' });
  }
}
module.exports = handler;
module.exports.bestMatch = bestMatch;
module.exports.stale = stale;
module.exports.clampName = clampName;
