import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT ?? 4173);
const types = new Map([
  ['html', 'text/html; charset=utf-8'],
  ['css', 'text/css; charset=utf-8'],
  ['js', 'text/javascript; charset=utf-8'],
  ['svg', 'image/svg+xml'],
  ['png', 'image/png']
]);

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const pathname = request.url?.split('?')[0];
  const relative = pathname === '/' ? 'index.html' : pathname?.slice(1);
  if (!relative || !/^(index\.html|(?:src|assets)\/[a-z\d-]+\.(?:css|js|svg|png))$/.test(relative)) {
    response.writeHead(404).end('Not found');
    return;
  }
  const file = join(root, relative);
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a regular file');
    response.writeHead(200, {
      'Content-Type': types.get(relative.split('.').at(-1)),
      'Content-Length': info.size,
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') response.end();
    else {
      const stream = createReadStream(file);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    }
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? 'Port ' + port + ' is already in use. Set PORT to choose another one.'
    : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log('SpriteCut is running at http://127.0.0.1:' + server.address().port);
});
