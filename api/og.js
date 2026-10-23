// Pixel Chess OG share cards (Vercel serverless). GET /api/og?room=ABCD[&t=TITLE&s=SUB&b=FEN]
// Renders a 1200x630 indexed PNG with zero runtime dependencies (zlib is a Node built-in).
// The look mirrors the in-game share card (chess/index.html shareCard): cream card, ink
// frame bars, orange CHESS ribbon, pixel type - and the classic SPEC piece sprites.
// api/share.js links here, server.js mirrors it, tests/og-test.js decodes the output.
const zlib = require('zlib');

const W = 1200, H = 630, TILE = 60, BOARD_X = 186, BOARD_Y = 75, TEXT_X = 700;

/* ---------- palette (indexed PNG; index 0 is the background) ---------- */
const CREAM = '#f5e9c8', INK = '#2a1d14', ORANGE = '#e8a013', SOFT = '#8a6d3b', GREEN = '#1f7a3c', GOLD = '#ffd23f';
const MID_D = ['#2b3a67', '#3a4c85', '#1f2b4d', '#34457a', '#27355c'];
const MID_L = ['#8fa3d6', '#a9bbe6', '#7488bc', '#9db0de', '#8195c8'];
// classic piece palettes, straight from chess/index.html PAL.w / PAL.b
const PW = { o: '#4a3426', d: '#a39270', s: '#cdbf9b', f: '#eee2c4', h: '#fbf4df', w: '#ffffff', e: '#2a1d14', g: '#d9a521' };
const PB = { o: '#07070d', d: '#1a1d2b', s: '#2b3046', f: '#434968', h: '#646c96', w: '#98a2d0', e: '#ffd23f', g: '#e8433a' };
const PALETTE = [...new Set([CREAM, INK, ORANGE, SOFT, GREEN, GOLD, '#e8433a',
  ...MID_D, ...MID_L, ...Object.values(PW), ...Object.values(PB)])];
const CIDX = new Map(PALETTE.map((c, i) => [c, i]));
const ci = c => (CIDX.has(c) ? CIDX.get(c) : 0);

/* ---------- 5x7 pixel font (uppercase only, matches the card's chunky type) ---------- */
const FONT = {
  A: '01110/10001/10001/11111/10001/10001/10001', B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01110/10001/10000/10000/10000/10001/01110', D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111', F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01110/10001/10000/10111/10001/10001/01111', H: '10001/10001/10001/11111/10001/10001/10001',
  I: '11111/00100/00100/00100/00100/00100/11111', J: '00111/00010/00010/00010/00010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001', L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110', P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101', R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110', T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110', V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/11011/10001', X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100', Z: '11111/00001/00010/00100/01000/10000/11111',
  0: '01110/10001/10011/10101/11001/10001/01110', 1: '00100/01100/00100/00100/00100/00100/01110',
  2: '01110/10001/00001/00110/01000/10000/11111', 3: '11110/00001/00001/01110/00001/00001/11110',
  4: '00010/00110/01010/10010/11111/00010/00010', 5: '11111/10000/10000/11110/00001/00001/11110',
  6: '01110/10000/10000/11110/10001/10001/01110', 7: '11111/00001/00010/00100/01000/01000/01000',
  8: '01110/10001/10001/01110/10001/10001/01110', 9: '01110/10001/10001/01111/00001/00001/01110',
  ' ': '00000/00000/00000/00000/00000/00000/00000', ':': '00000/00100/00100/00000/00100/00100/00000',
  '-': '00000/00000/00000/11111/00000/00000/00000', '.': '00000/00000/00000/00000/00000/01100/01100',
  '!': '00100/00100/00100/00100/00100/00000/00100', "'": '00100/00100/00000/00000/00000/00000/00000',
};
const glyph = ch => FONT[ch] || FONT[' '];

/* ---------- classic piece sprites, straight from chess/index.html SPEC ---------- */
const SPEC = {
  P: ['.....oooooo.....', '...oohhhhhhdo...', '..oohwwffffddso.', '..oohwffffffdso.', '..oofffffffdsso.',
    '...ooffffffsso..', '....ooooddoo....', '...oohffffsso...', '....ohffffdso...', '...ohhhfffdso...',
    '..ohhhhfffdssso.', '.oohhhhhfffdsso.', '.oohhhhhfffdssso', 'oohhhhhhhffdssso', 'oooooooooooooooo'],
  R: ['oo..oo..oo..oo..', 'oho.oho.oho.oho.', 'ohs.ohs.ohs.ohs.', 'oooooooooooooooo', 'oohhhhhhfffffsoo',
    '.oohhhhhffffsso.', '..oohhhfffdssoo.', '..oohhhfffdssoo.', '..oohhhfffdssoo.', '..oohhfodffssoo.',
    '..oohhfodffssoo.', '..oohhhfffdssoo.', '..oohhhfffdssoo.', '.oohhhhhffffsso.', 'oohhhhhhfffffsoo',
    'oohhhhhhhfffdsso', 'oohhhhhhhffdssoo', 'oooooooooooooooo'],
  N: ['.....oo...oo....', '....oho..oho....', '...ohfoooohfo...', '..ohwfffffhffo..', '.ohwefffffffffo.',
    'ohwfffffffofffo.', 'ohffooffffhfffo.', 'ohfo.offffhfffo.', 'oooo.offffffffo.', '.....offffffsso.',
    '....ohfffffsso..', '...ohhfffffdsso.', '..ohhhfffffdso..', '.oohhhfffffdso..', 'oohhhhhfffffdsso',
    'oohhhhhfffffdsoo', 'oooooooooooooooo'],
  B: ['.......gg.......', '......oggo......', '.......oo.......', '......ohfo......', '.....ohhfso.....',
    '....ohhhffso....', '...ohhhofffso...', '...ohhfooffso...', '..ohhhfofffds...', '..ohhfffffffds..',
    '..ohhffggfffds..', '...ohffggffso...', '....ooffffoo....', '....ohffffso....', '...ohhffffdso...',
    '..oohhhhfffdso..', '.oohhhhhffdsssoo', 'oooooooooooooooo'],
  Q: ['og..og..gg..go.g', 'oo..oo..oo..oo.o', 'oho.ohoohhhoho.o', 'ohfoohfohhhfohfo', 'oohhffffhhhhffho',
    '.ooggffffffggoo.', '..oohfffffffoo..', '...ohhffffdso...', '...ohhffggfdso..', '....ohffffdso...',
    '...ohhfffffdso..', '..ohhhffffffdso.', '.ohhhhffffffdsso', 'oohhhhhfffffdsoo', '.oohhhhhffffdsso',
    'oohhhhhhhfffdsso', 'oohhhhhhhffdssoo', 'oooooooooooooooo'],
  K: ['......oggo......', '....ooooggoooo..', '......oggo......', '......oggo......', '...oooohhhhoooo.',
    '..ohhhffffffffso', '.ohhhhffggffffso', '.oohhhhhhhhhhffo', '..oohhffffffffoo', '...ohhffggfffdso',
    '...ohhffggfffdso', '...ohhfffffffdso', '..ohhhfffffffdso', '.ohhhhfffffffdss', '.oohhhhhfffffdso',
    'oohhhhhhfffffdso', 'oohhhhhhffdsssso', 'oooooooooooooooo'],
};
const START = ['rnbqkbnr', 'pppppppp', '........', '........', '........', '........', 'PPPPPPPP', 'RNBQKBNR'];

/* ---------- tiny canvas + drawing ---------- */
function rect(cv, x, y, w, h, col) {
  const i = ci(col);
  const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
  const x1 = Math.min(cv.w, x0 + (w | 0)), y1 = Math.min(cv.h, y0 + (h | 0));
  for (let yy = y0; yy < y1; yy++) { const row = yy * cv.w; cv.px.fill(i, row + x0, row + x1); }
}
function textW(s, scale) { return s.length ? (s.length * 6 - 1) * scale : 0; }
function drawGlyph(cv, ch, x, y, scale, col) {
  const g = glyph(ch).split('/');
  for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++)
    if (g[gy][gx] === '1') rect(cv, x + gx * scale, y + gy * scale, scale, scale, col);
}
function drawText(cv, s, x, y, scale, col, align) {
  const w = textW(s, scale);
  let xx = align === 'center' ? x - (w >> 1) : align === 'right' ? x - w : x;
  for (const ch of s) { drawGlyph(cv, ch, xx, y, scale, col); xx += 6 * scale; }
}
/* letters rotated -90 (reads bottom-to-top, tops facing left) for the CHESS ribbon */
function drawTextV(cv, s, x, yBottom, scale, col) {
  for (const ch of s) {
    const g = glyph(ch).split('/');
    for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < 5; gx++)
      if (g[gy][gx] === '1') rect(cv, x + gy * scale, yBottom - (gx + 1) * scale, scale, scale, col);
    yBottom -= 7 * scale;
  }
}
function drawPiece(cv, p, X, Y) {
  const rows = SPEC[p[1]], pal = p[0] === 'w' ? PW : PB, s = TILE / 20;
  const ox = X + 2 * s, oy = Y + 18 * s - rows.length * s;
  for (let gy = 0; gy < rows.length; gy++) for (let gx = 0; gx < 16; gx++) {
    const ch = rows[gy][gx];
    if (ch === '.') continue;
    rect(cv, Math.round(ox + gx * s), Math.round(oy + gy * s), s, s, pal[ch] || '#e8433a');
  }
}
function drawBoard(cv, placement) {
  rect(cv, BOARD_X - 6, BOARD_Y - 6, 8 * TILE + 12, 8 * TILE + 12, INK);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const dk = (r + c) % 2, x = BOARD_X + c * TILE, y = BOARD_Y + r * TILE;
    rect(cv, x, y, TILE, TILE, dk ? MID_D[0] : MID_L[0]);
    rect(cv, x, y, TILE, 2, dk ? MID_D[1] : MID_L[1]);
    rect(cv, x, y, 2, TILE, dk ? MID_D[1] : MID_L[1]);
    rect(cv, x, y + TILE - 2, TILE, 2, dk ? MID_D[2] : MID_L[2]);
    rect(cv, x + TILE - 2, y, 2, TILE, dk ? MID_D[2] : MID_L[2]);
    for (let k = 0; k < 7; k++) {
      const sx = x + Math.floor(((r * 5 + c * 3 + k * 7) % 17 + 1) * TILE / 20);
      const sy = y + Math.floor(((r * 11 + c * 7 + k * 5) % 17 + 1) * TILE / 20);
      rect(cv, sx, sy, TILE / 20, TILE / 20, dk ? MID_D[3] : MID_L[3]);
    }
  }
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const ch = placement[r][c];
    if (!ch || ch === '.') continue;
    drawPiece(cv, (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase(), BOARD_X + c * TILE, BOARD_Y + r * TILE);
  }
}

/* ---------- params ---------- */
function fenBoard(v) {
  const s = String(Array.isArray(v) ? v[0] : v || '').trim();
  if (!s || /^start$/i.test(s)) return START;
  const ranks = s.split('/');
  if (ranks.length !== 8) return START;
  const out = [];
  for (const rk of ranks) {
    if (!/^[rnbqkpRNBQKP1-8]+$/.test(rk)) return START;
    let row = '';
    for (const ch of rk) { if (ch >= '1' && ch <= '8') row += '.'.repeat(+ch); else row += ch; }
    if (row.length !== 8) return START;
    out.push(row);
  }
  return out;
}
function sanitizeParams(q) {
  q = q || {};
  const one = v => (Array.isArray(v) ? v[0] : v);
  let room = String(one(q.room) || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (room.length !== 4) room = '';
  const clean = (v, n) => String(one(v) || '').toUpperCase().replace(/[^A-Z0-9 :!'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  return { room, board: fenBoard(one(q.b)), title: clean(q.t, 12), sub: clean(q.s, 26) };
}
function sanitizeHost(h) {
  return String(Array.isArray(h) ? h[0] : h || '').replace(/[^A-Za-z0-9.:-]/g, '').slice(0, 80) || 'localhost';
}

/* ---------- card ---------- */
function renderCard(opts) {
  const o = opts || {};
  const room = o.room || '';
  const cv = { w: W, h: H, px: new Uint8Array(W * H) };
  rect(cv, 0, 0, W, H, CREAM);
  rect(cv, 0, 0, W, 10, INK);
  rect(cv, 0, H - 10, W, 10, INK);
  rect(cv, 0, 10, 140, H - 20, ORANGE);
  drawTextV(cv, 'CHESS', 52, 420, 5, INK);
  drawBoard(cv, Array.isArray(o.board) ? o.board : fenBoard(o.board));
  // right column
  const title = (o.title || (room ? 'CHALLENGE' : 'PIXEL CHESS')).slice(0, 12);
  drawText(cv, title, TEXT_X, 120, 6, INK);
  if (room) {
    const plateW = textW('ROOM ' + room, 4) + 28;
    rect(cv, TEXT_X, 216, Math.min(plateW, W - 30 - TEXT_X), 56, INK);
    drawText(cv, 'ROOM ' + room, TEXT_X + 14, 230, 4, GOLD);
  } else {
    const line = (o.sub || 'THE TOWER AWAITS').slice(0, 16);
    drawText(cv, line, TEXT_X, 230, 4, INK);
  }
  const sub = (o.sub || (room ? 'PLAY ME IN PIXEL CHESS' : 'PLAY FREE IN YOUR BROWSER')).slice(0, 26);
  drawText(cv, sub, TEXT_X, 320, 3, SOFT);
  // sprite row (mirrors the title screen: BRKQNB... pieces in a line)
  'wK wQ wB wN wR wP'.split(' ').forEach((p, i) =>
    drawPiece(cv, p, 780 + i * 62, 470));
  if (o.host) drawText(cv, String(o.host).toUpperCase(), 780, 560, 2, SOFT);
  return encodePng(cv);
}

/* ---------- PNG (indexed, zlib-deflated, hand-rolled chunks) ---------- */
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRCT = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRCT[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const head = Buffer.alloc(4); head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}
function encodePng(cv) {
  const raw = Buffer.alloc((cv.w + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) raw.set(cv.px.subarray(y * cv.w, (y + 1) * cv.w), y * (cv.w + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0); ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; ihdr[9] = 3; // 8-bit palette
  const plte = Buffer.from(PALETTE.flatMap(c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]));
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('PLTE', plte),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- endpoint ---------- */
async function handler(req, res) {
  try {
    const method = (req && req.method) || 'GET';
    if (method !== 'GET' && method !== 'HEAD') return res.status(405).json({ ok: false, err: 'method' });
    const p = sanitizeParams((req && req.query) || {});
    p.host = sanitizeHost(((req && req.headers) || {}).host);
    const png = renderCard(p);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(png);
  } catch (e) {
    return res.status(500).json({ ok: false, err: 'render failed' });
  }
}
module.exports = handler;
module.exports.renderCard = renderCard;
module.exports.sanitizeParams = sanitizeParams;
module.exports.sanitizeHost = sanitizeHost;
module.exports.fenBoard = fenBoard;
module.exports.SPEC = SPEC;
module.exports.FONT = FONT;
module.exports.PALETTE = PALETTE;
module.exports.W = W;
module.exports.H = H;
