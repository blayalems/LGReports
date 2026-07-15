import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const root = resolve('dist');
const prefix = '/LGReports';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

function safeFile(pathname) {
  const relative = pathname === prefix || pathname === `${prefix}/` ? 'index.html' : pathname.slice(prefix.length + 1);
  const file = resolve(root, relative || 'index.html');
  return file === root || file.startsWith(`${root}${sep}`) ? file : null;
}

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', `http://${host}`).pathname);
    if (pathname === prefix) {
      response.writeHead(308, { Location: `${prefix}/` });
      response.end();
      return;
    }
    if (!pathname.startsWith(`${prefix}/`)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    let file = safeFile(pathname);
    if (!file) throw new Error('Unsafe path');
    try {
      if (!(await stat(file)).isFile()) file = resolve(root, 'index.html');
    } catch {
      file = resolve(root, 'index.html');
    }
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.message : 'Server error');
  }
});

server.listen(port, host, () => {
  console.log(`GitHub Pages parity server: http://${host}:${port}${prefix}/`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
