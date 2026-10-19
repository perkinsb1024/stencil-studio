import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function startServer(t, root, args = []) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/serve.js', import.meta.url)), ...args], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { child.kill(); });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 5000);
    child.stdout.on('data', data => { output += data; const match = output.match(/http:\/\/localhost:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
    child.stderr.on('data', data => { output += data; });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
  return url;
}
test('development server injects live updates, batches atomic saves, and ignores build output', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'stencil-live-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src')); await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'index.html'), '<html><body>Hello</body></html>');
  await writeFile(join(root, 'src/style.css'), 'body{color:red}');
  const url = await startServer(t, root);
  assert.match(await (await fetch(url)).text(), /src="\/__dev\/client.js"/);
  assert.match(await (await fetch(url + '/__dev/client.js')).text(), /EventSource/);
  const controller = new AbortController();
  t.after(() => controller.abort());
  const stream = await fetch(url + '/__dev/events', { signal: controller.signal });
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader(), messages = [];
  const consume = (async () => {
    let buffer = '';
    try { for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += new TextDecoder().decode(value);
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const message = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const data = message.match(/^data: (.+)$/m); if (data) messages.push(JSON.parse(data[1]));
      }
    } } catch (error) { if (error.name !== 'AbortError') throw error; }
  })();
  await writeFile(join(root, 'src/.style.tmp'), 'body{color:blue}');
  await rename(join(root, 'src/.style.tmp'), join(root, 'src/style.css'));
  await writeFile(join(root, 'src/main.js'), 'console.log("updated")');
  const deadline = Date.now() + 5000;
  while (!messages.some(m => m.paths.includes('/src/main.js')) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(messages.some(m => m.paths.includes('/src/style.css')));
  assert.ok(messages.some(m => m.paths.includes('/src/main.js')));
  const count = messages.length;
  await writeFile(join(root, 'dist/main.js'), 'ignored');
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(messages.length, count);
  controller.abort(); await consume;
});
test('preview serves static HTML without live reload endpoints', async t => {
  const root = await mkdtemp(join(tmpdir(), 'stencil-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), '<body>Static preview</body>');
  const url = await startServer(t, root, [root]);
  assert.equal(await (await fetch(url)).text(), '<body>Static preview</body>');
  assert.equal((await fetch(url + '/__dev/events')).status, 404);
});
