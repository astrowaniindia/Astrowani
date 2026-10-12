const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 4600;

/**
 * LOCAL DEVELOPMENT ONLY. Production serves these files straight from nginx and
 * never runs this script.
 *
 * /api and /socket.io are proxied to the live backend so the browser sees them
 * as same-origin. That is purely a convenience for working on the web client
 * from a laptop: the deployed site calls backend.astrowani.com directly and
 * needs its own origin listed in the backend's CORS_ORIGINS env var instead.
 */
const API_TARGET = process.env.AW_API_TARGET || 'backend.astrowani.com';

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
};

function isProxied(urlPath) {
  return urlPath.startsWith('/api/') || urlPath.startsWith('/socket.io/');
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (isProxied(urlPath)) {
    const upstream = https.request(
      {
        hostname: API_TARGET,
        port: 443,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: API_TARGET },
      },
      (upRes) => {
        res.writeHead(upRes.statusCode, upRes.headers);
        upRes.pipe(res);
      },
    );
    upstream.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: `Proxy error: ${err.message}` }));
    });
    req.pipe(upstream);
    return;
  }

  let filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // Dev only. ES module imports carry no cache-busting query of their own,
      // so without this an edited module keeps serving the old copy and you
      // debug code that is no longer on disk.
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(data);
  });
});

// Socket.io's websocket transport needs the HTTP upgrade forwarded too, or the
// client silently falls back to polling and real-time testing proves nothing.
server.on('upgrade', (req, socket, head) => {
  const upstream = https.request({
    hostname: API_TARGET,
    port: 443,
    path: req.url,
    method: 'GET',
    headers: { ...req.headers, host: API_TARGET },
  });
  upstream.end();

  upstream.on('upgrade', (upRes, upSocket, upHead) => {
    const lines = Object.entries(upRes.headers).map(([k, v]) => `${k}: ${v}`);
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join('\r\n')}\r\n\r\n`);
    if (upHead && upHead.length) socket.unshift(upHead);
    upSocket.pipe(socket);
    socket.pipe(upSocket);
    upSocket.on('error', () => socket.destroy());
    socket.on('error', () => upSocket.destroy());
  });
  upstream.on('error', () => socket.destroy());
});

server.listen(PORT, () => {
  console.log(`Astrowani website dev server on http://localhost:${PORT}`);
  console.log(`  /api and /socket.io -> https://${API_TARGET} (dev proxy)`);
});
