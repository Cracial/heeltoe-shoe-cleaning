'use strict';
// Sepatu Kinclong — server utama. Tanpa dependensi: http + node:sqlite bawaan Node.js >= 22.13.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const { migrate } = require('./src/db');
const { seed } = require('./src/seed');
const { Router, readBody, parseCookies, sendJson } = require('./src/lib/http');
const { HttpError } = require('./src/lib/util');
const { userFromToken, COOKIE } = require('./src/lib/auth');

migrate();
if (seed({ demoOrders: process.env.SEED_DEMO !== '0' })) console.log('✓ Database baru dibuat & diisi data awal');

const router = new Router();
require('./src/routes/public')(router);
require('./src/routes/auth')(router);
require('./src/routes/orders')(router);
require('./src/routes/inventory')(router);
require('./src/routes/admin')(router);

const FRONTEND_DIST = path.join(__dirname, 'frontend', 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

// Serve React production files and support browser history routes.
function serveStatic(req, res, pathname) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    return res.end('Bad Request');
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const full = path.resolve(FRONTEND_DIST, relativePath);
  const relative = path.relative(FRONTEND_DIST, full);

  // Prevent requests from escaping the React build directory.
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    return res.end('Forbidden');
  }

  const sendFile = (file, stat) => {
    const ext = path.extname(file).toLowerCase();
    const isHtml = ext === '.html';
    const isHashedAsset = decodedPath.startsWith('/assets/');

    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': isHtml
        ? 'no-cache'
        : isHashedAsset
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
      ...SECURITY_HEADERS,
    });

    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(file);
    stream.on('error', (error) => {
      console.error('Gagal membaca file frontend:', error.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
        res.end('Gagal membaca file frontend');
      } else {
        res.destroy(error);
      }
    });
    stream.pipe(res);
  };

  fs.stat(full, (err, stat) => {
    if (!err && stat.isFile()) return sendFile(full, stat);

    // Only HTML navigation requests receive the React SPA entry point.
    const acceptsHtml = String(req.headers.accept || '').includes('text/html');
    const isClientRoute = !path.extname(decodedPath);

    if (!acceptsHtml || !isClientRoute) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
      return res.end('<h1>404</h1><p>Halaman atau aset tidak ditemukan.</p>');
    }

    const indexFile = path.join(FRONTEND_DIST, 'index.html');
    fs.stat(indexFile, (indexError, indexStat) => {
      if (indexError || !indexStat.isFile()) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
        return res.end('Build React belum tersedia. Jalankan "npm run build" dari root proyek.');
      }

      sendFile(indexFile, indexStat);
    });
  });
}
async function handleApi(req, res, url) {
  const m = router.match(req.method, url.pathname);
  if (!m) throw new HttpError(404, 'Endpoint tidak ditemukan');
  if (m === 'METHOD') throw new HttpError(405, 'Metode tidak diizinkan');
  const cookies = parseCookies(req.headers.cookie);
  const headers = {};
  const ctx = {
    req, res, cookies,
    params: m.params,
    query: Object.fromEntries(url.searchParams),
    body: await readBody(req),
    user: userFromToken(cookies[COOKIE]),
    ip: (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress,
    secure: process.env.COOKIE_SECURE === '1',
    setHeader: (k, v) => { headers[k] = v; },
  };
  let result;
  for (const h of m.route.handlers) result = h(ctx);
  sendJson(res, 200, result === undefined ? { ok: true } : result, { ...SECURITY_HEADERS, ...headers });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Metode tidak diizinkan');
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(new Date().toISOString(), req.method, url.pathname, e);
    if (!res.headersSent) {
      sendJson(res, status, { error: status === 500 ? 'Terjadi kesalahan di server' : e.message, ...(e.extra || {}) }, SECURITY_HEADERS);
    }
  }
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`HeelToe Shoe Cleaning berjalan di http://localhost:${PORT}`);
  console.log(`  Landing page   : http://localhost:${PORT}/`);
  console.log(`  Aplikasi staf  : http://localhost:${PORT}/login`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(); require('./src/db').db.close(); process.exit(0); });
}
