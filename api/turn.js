// Pixel Chess TURN credentials (Vercel serverless).
// With CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN set, returns short-lived
// relay credentials so players behind strict NATs can connect. Without them (or if
// Cloudflare is down) it degrades to STUN-only, which still works on most networks.
const STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];
const CF = 'https://rtc.live.cloudflare.com/v1/turn/keys/';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, err: 'method' });
  const id = process.env.CLOUDFLARE_TURN_KEY_ID, token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!id || !token) return res.status(200).json({ ok: true, fallback: true, iceServers: STUN });
  try {
    const r = await fetch(CF + encodeURIComponent(id) + '/credentials/generate-ice-servers', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 3600 }),
    });
    if (!r.ok) throw new Error('cf ' + r.status);
    const d = await r.json(), s = (d && d.iceServers) || {};
    const urls = Array.isArray(s.urls) ? s.urls : (s.urls ? [s.urls] : []);
    const ice = urls.length ? [{ urls, username: s.username, credential: s.credential }] : [];
    return res.status(200).json({ ok: true, ttl: 3600, iceServers: ice.concat(STUN) });
  } catch (e) {
    return res.status(200).json({ ok: true, fallback: true, iceServers: STUN });
  }
}
module.exports = handler;
module.exports.STUN = STUN;
