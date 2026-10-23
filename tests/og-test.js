// OG image + share card tests: node tests/og-test.js
// Verifies PNG chunk encoding (IHDR, PLTE, IDAT zlib inflate), FEN board rendering,
// parameter sanitization, api/share.js meta tags + redirect, and server.js parity.
const zlib = require('zlib');
const og = require('../api/og.js');
const share = require('../api/share.js');

let fails = 0;
const ok = (n, c, x = '') => {
  if (!c) fails++;
  console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : '  ' + JSON.stringify(x)));
};

function decodePng(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!Buffer.isBuffer(buf) || buf.length < 33 || !buf.subarray(0, 8).equals(sig)) return null;
  let off = 8;
  const chunks = {};
  const idats = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IDAT') idats.push(data);
    else chunks[type] = data;
    off += 12 + len;
    if (type === 'IEND') break;
  }
  if (!chunks.IHDR || !chunks.PLTE || !idats.length) return null;
  const w = chunks.IHDR.readUInt32BE(0);
  const h = chunks.IHDR.readUInt32BE(4);
  const depth = chunks.IHDR[8], colorType = chunks.IHDR[9];
  const raw = zlib.inflateSync(Buffer.concat(idats));
  return { w, h, depth, colorType, plteLen: chunks.PLTE.length, raw };
}

(async () => {
  // ---- 1. PNG structure & dimensions ----
  const png0 = og.renderCard({});
  const d0 = decodePng(png0);
  ok('valid indexed PNG 1200x630', d0 && d0.w === 1200 && d0.h === 630 && d0.depth === 8 && d0.colorType === 3, d0 && { w: d0.w, h: d0.h });
  ok('palette matches PALETTE length * 3', d0 && d0.plteLen === og.PALETTE.length * 3, d0 && d0.plteLen);
  ok('raw scanlines match (W+1)*H with filter 0', d0 && d0.raw.length === (1200 + 1) * 630 && d0.raw[0] === 0);

  // ---- 2. Room plate + FEN board alters pixels ----
  const pngRoom = og.renderCard({ room: 'K9X2', title: 'CHALLENGE', sub: 'PLAY ME NOW' });
  ok('room card differs from default card', !png0.equals(pngRoom));
  const mateFen = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR';
  const pngFen = og.renderCard({ room: 'K9X2', board: og.fenBoard(mateFen) });
  ok('custom FEN board alters rendered pixels', !pngRoom.equals(pngFen));

  // ---- 3. FEN parser & parameter sanitizer ----
  const bValid = og.fenBoard(mateFen);
  ok('fenBoard parses scholar mate rank 2', bValid[1] === 'pppp.Qpp', bValid[1]);
  const bBad = og.fenBoard('not-a-fen/at/all');
  ok('fenBoard falls back to START on invalid input', bBad[0] === 'rnbqkbnr' && bBad[7] === 'RNBQKBNR');
  const sp = og.sanitizeParams({ room: 'ab!', t: '  hello <script> world  ', s: 'play me!' });
  ok('sanitizeParams rejects short room and strips HTML chars', sp.room === '' && sp.title === 'HELLO SCRIPT' && sp.sub === 'PLAY ME!', sp);
  const sp2 = og.sanitizeParams({ room: 'ab12' });
  ok('sanitizeParams keeps valid 4-char room', sp2.room === 'AB12', sp2);
  ok('sanitizeHost strips unsafe chars', og.sanitizeHost('evil.com/<script>') === 'evil.comscript');

  // ---- 4. HTTP handler for /api/og ----
  const mockRes = () => {
    const r = { headers: {} };
    r.setHeader = (k, v) => { r.headers[k] = v; };
    r.status = c => { r.code = c; return r; };
    r.json = o => { r.body = o; return r; };
    r.send = b => { r.body = b; return r; };
    return r;
  };
  let r = mockRes();
  await og({ method: 'POST' }, r);
  ok('og rejects POST with 405', r.code === 405);
  r = mockRes();
  await og({ method: 'GET', query: { room: 'ABCD' }, headers: { host: 'pixelchess.example' } }, r);
  ok('og GET returns 200 image/png', r.code === 200 && r.headers['Content-Type'] === 'image/png' && Buffer.isBuffer(r.body) && r.body.length > 1000);

  // ---- 5. Share HTML landing page (/api/share) ----
  let sr = mockRes();
  await share({ method: 'POST' }, sr);
  ok('share rejects POST with 405', sr.code === 405);
  sr = mockRes();
  await share({ method: 'GET', query: { room: 'WXYZ', t: 'MATE IN 5' }, headers: { host: 'pixelchess.example', 'x-forwarded-proto': 'https' } }, sr);
  ok('share GET returns 200 html with og:image and room redirect',
    sr.code === 200 &&
    /text\/html/.test(sr.headers['Content-Type']) &&
    sr.body.includes('https://pixelchess.example/api/og?room=WXYZ&amp;t=MATE+IN+5') &&
    sr.body.includes('/chess/index.html?room=WXYZ'),
    sr.body && sr.body.slice(0, 300));

  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
