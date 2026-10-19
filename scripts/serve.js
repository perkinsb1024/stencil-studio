import http from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.argv[2] || '.');
const development = !process.argv[2];
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const clients = new Set();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (development && url.pathname === '/__dev/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
      req.on('close', () => { clearInterval(heartbeat); clients.delete(res); });
      return;
    }
    if (development && url.pathname === '/__dev/client.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache' });
      return res.end(await readFile(new URL('./live-reload-client.js', import.meta.url)));
    }
    let path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    let content = await readFile(path);
    if (development && extname(path) === '.html') {
      const html = content.toString();
      const closingBody = [...html.matchAll(/<\/body\s*>/gi)].at(-1);
      const index = closingBody?.index ?? html.length;
      content = html.slice(0, index) + '<script type="module" src="/__dev/client.js"></script>' + html.slice(index);
    }
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch { res.writeHead(404); res.end('Not found'); }
});

if (development) {
  const pending = new Set();
  let timer;
  // Watch the directory, so saves that atomically replace files are also detected.
  const watcher = watch(root, { recursive: true }, (event, filename) => {
    if (!filename) return;
    const path = filename.toString().split(sep).join('/');
    if (path.split('/').some(part => part.startsWith('.') || ['node_modules', 'dist', 'test-results', 'playwright-report'].includes(part))) return;
    if (!(path === 'index.html' || path.startsWith('src/') || path.startsWith('vendor/'))) return;
    if (!['.html', '.js', '.css', '.svg', '.ttf', '.woff2'].includes(extname(path))) return;
    pending.add('/' + path);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const message = `event: change\ndata: ${JSON.stringify({ paths: [...pending] })}\n\n`;
      pending.clear();
      for (const client of clients) client.write(message);
    }, 100);
  });
  server.on('close', () => { watcher.close(); clearTimeout(timer); });
}
server.listen(port, '127.0.0.1', () => console.log(`Stencil Studio: http://localhost:${server.address().port}${development ? ' (live updates enabled)' : ''}`));
