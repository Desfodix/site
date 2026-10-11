// Минимальный сервер без зависимостей: статика + API для админки.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA, 'content.json');
const PASS = process.env.ADMIN_PASSWORD || '';
if (!PASS) { console.error('Задайте ADMIN_PASSWORD (см. .env.example)'); process.exit(1); }
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('kaneix:' + PASS).digest('hex');

fs.mkdirSync(DATA, { recursive: true });
if (!fs.existsSync(FILE)) fs.copyFileSync(path.join(__dirname, 'seed-content.json'), FILE);

const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const token = () => { const e = String(Date.now() + 7 * 864e5); return e + '.' + sign(e); };
const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const authed = req => {
  const m = /(?:^|; )s=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [e, sig] = m[1].split('.');
  return !!sig && +e > Date.now() && eq(sig, sign(e));
};

const tries = new Map(); // ip -> {n, t}
const limited = ip => { const r = tries.get(ip); return r && r.t > Date.now() && r.n >= 10; };
const fail = ip => { const r = tries.get(ip); if (r && r.t > Date.now()) r.n++; else tries.set(ip, { n: 1, t: Date.now() + 15 * 6e4 }); };

const HEAD = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; base-uri 'none'; form-action 'self'"
};
const send = (res, code, body, type = 'application/json', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', ...HEAD, ...extra });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const body = req => new Promise((ok, no) => {
  let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) { no(new Error('big')); req.destroy(); } });
  req.on('end', () => ok(b)); req.on('error', no);
});
const valid = d => d && ['projects', 'articles'].every(k => Array.isArray(d[k]) &&
  d[k].every(x => x && typeof x.id === 'string' && /^[a-z0-9-]+$/.test(x.id) && x.t && x.s && x.b));

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (url === '/api/health') return send(res, 200, { ok: true });
    if (url === '/api/me') return send(res, 200, { owner: authed(req) });
    if (url === '/api/content' && req.method === 'GET') return send(res, 200, fs.readFileSync(FILE, 'utf8'));
    if (url === '/api/content' && req.method === 'PUT') {
      if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
      const d = JSON.parse(await body(req));
      if (!valid(d)) return send(res, 400, { error: 'bad content' });
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(d, null, 2));
      fs.renameSync(FILE + '.tmp', FILE);
      return send(res, 200, { ok: true });
    }
    if (url === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress;
      if (limited(ip)) return send(res, 429, { error: 'too many attempts' });
      const { password = '' } = JSON.parse(await body(req) || '{}');
      const h = v => crypto.createHash('sha256').update(String(v)).digest('hex');
      if (!eq(h(password), h(PASS))) { fail(ip); return send(res, 401, { error: 'wrong password' }); }
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      return send(res, 200, { ok: true }, 'application/json', { 'Set-Cookie': `s=${token()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}` });
    }
    if (req.method === 'GET' && !url.startsWith('/api/'))
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html')), 'text/html', { 'Cache-Control': 'no-cache' });
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 400, { error: 'bad request' }); }
}).listen(PORT, () => console.log('KaneiX site on :' + PORT));
