// Pixel Chess share landing page (Vercel serverless). GET /api/share?room=ABCD[&t=TITLE&s=SUB&b=FEN]
// Serves Open Graph + Twitter Card meta tags pointing at /api/og, then redirects human
// visitors straight into /chess/index.html (with ?room=ABCD when a room code is present).
const og = require('./og.js');

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function buildShareHtml(query, headers) {
  const q = query || {}, h = headers || {};
  const p = og.sanitizeParams(q);
  const host = og.sanitizeHost(h.host);
  const proto = String(h['x-forwarded-proto'] || '').toLowerCase() === 'https' || (!/^localhost(:|$)|^127\./.test(host) && host !== 'localhost') ? 'https' : 'http';
  const origin = proto + '://' + host;
  const qs = new URLSearchParams();
  if (p.room) qs.set('room', p.room);
  if (p.title) qs.set('t', p.title);
  if (p.sub) qs.set('s', p.sub);
  const rawB = Array.isArray(q.b) ? q.b[0] : q.b;
  if (rawB && og.fenBoard(rawB) !== og.fenBoard('start')) qs.set('b', String(rawB).trim());
  const qstr = qs.toString();
  const imgUrl = origin + '/api/og' + (qstr ? '?' + qstr : '');
  const dest = '/chess/index.html' + (p.room ? '?room=' + p.room : '');
  const title = p.title || (p.room ? 'PIXEL CHESS - ROOM ' + p.room : 'PIXEL CHESS');
  const desc = p.sub || (p.room ? 'CHALLENGE - PLAY ME IN PIXEL CHESS (ROOM ' + p.room + ')' : 'THE TOWER AWAITS - PLAY FREE IN YOUR BROWSER');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<title>' + esc(title) + '</title>' +
    '<meta name="description" content="' + esc(desc) + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:site_name" content="Pixel Chess">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:image" content="' + esc(imgUrl) + '">' +
    '<meta property="og:image:type" content="image/png">' +
    '<meta property="og:image:width" content="1200">' +
    '<meta property="og:image:height" content="630">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(title) + '">' +
    '<meta name="twitter:description" content="' + esc(desc) + '">' +
    '<meta name="twitter:image" content="' + esc(imgUrl) + '">' +
    '<meta http-equiv="refresh" content="0; url=' + esc(dest) + '">' +
    '<script>location.replace(' + JSON.stringify(dest) + ');</script>' +
    '</head><body style="background:#1b1230;color:#f5e9c8;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
    '<p><a href="' + esc(dest) + '" style="color:#ffd23f;text-decoration:none">&#9658; Launch Pixel Chess</a></p>' +
    '</body></html>';
}

async function handler(req, res) {
  try {
    const method = (req && req.method) || 'GET';
    if (method !== 'GET' && method !== 'HEAD') return res.status(405).json({ ok: false, err: 'method' });
    const html = buildShareHtml((req && req.query) || {}, (req && req.headers) || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
    return res.status(200).send(html);
  } catch (e) {
    return res.status(500).json({ ok: false, err: 'share failed' });
  }
}

module.exports = handler;
module.exports.buildShareHtml = buildShareHtml;
module.exports.esc = esc;
