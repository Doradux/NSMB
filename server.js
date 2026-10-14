'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};
const allowed = new Set(['index.html', 'styles.css', 'app.js', 'assets/world-1-1.webp', 'assets/world-1-1.png', 'assets/favicon.svg', 'web-runtime/lab.html', 'web-runtime/dist/guest_memory.mjs', 'web-runtime/dist/guest_memory.wasm']);
http.createServer((req,res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!allowed.has(requested)) {
    res.writeHead(404, {'content-type':'text/plain; charset=utf-8'}); return res.end('Not found');
  }
  const file = path.join(root, requested);
  fs.readFile(file,(err,data)=>{
    if(err){ res.writeHead(500,{'content-type':'text/plain; charset=utf-8'}); return res.end('File not available'); }
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(port,'127.0.0.1',()=>console.log('NSMB Wii concept site: http://localhost:'+port));
