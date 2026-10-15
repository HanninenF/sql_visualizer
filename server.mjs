import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(rootDir, 'data');
const dbPath = path.join(dataDir, 'sqlviz.sqlite');
const port = Number(process.env.PORT || 5500);
const MAX_BODY = 10 * 1024 * 1024;

fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA busy_timeout = 10000;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function readSnapshot() {
  const snapshot = {};
  for (const row of db.prepare('SELECT key, value FROM kv').all()) snapshot[row.key] = row.value;
  return snapshot;
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('Snapshot must be an object');
  for (const [key, value] of Object.entries(snapshot)) {
    if (!key.startsWith('sqlviz.') || key === 'sqlviz.meta.sqliteDirty') throw new Error(`Invalid storage key: ${key}`);
    if (typeof value !== 'string') throw new Error(`Invalid value for storage key: ${key}`);
  }
}

function hasChanged(base, other, key) {
  const baseHas = Object.prototype.hasOwnProperty.call(base, key);
  const otherHas = Object.prototype.hasOwnProperty.call(other, key);
  return baseHas !== otherHas || base[key] !== other[key];
}

function mergeSnapshots(base, next, latest) {
  const merged = { ...latest };
  const conflicts = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(next), ...Object.keys(latest)]);
  for (const key of keys) {
    const changedByUs = hasChanged(base, next, key);
    const changedByOther = hasChanged(base, latest, key);
    const versionsDiffer = hasChanged(next, latest, key);
    if (changedByUs && changedByOther && versionsDiffer) conflicts.push(key);
    if (!changedByUs) continue;
    if (Object.prototype.hasOwnProperty.call(next, key)) merged[key] = next[key];
    else delete merged[key];
  }
  return { merged, conflicts };
}

function writeSnapshot(snapshot) {
  validateSnapshot(snapshot);
  db.exec('BEGIN;');
  try {
    db.exec('DELETE FROM kv;');
    const statement = db.prepare('INSERT INTO kv (key, value) VALUES (?, ?)');
    try {
      for (const [key, value] of Object.entries(snapshot)) statement.run(key, value);
    } finally {
      statement.finalize?.();
    }
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function sendJson(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) });
  response.end(text);
}

async function readJson(request) {
  let size = 0;
  let body = '';
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request body is too large');
    body += chunk;
  }
  return JSON.parse(body || '{}');
}

async function handleApi(request, response, pathname) {
  if (request.method === 'GET' && pathname === '/api/storage') {
    const snapshot = readSnapshot();
    return sendJson(response, 200, { snapshot, hasData: Object.keys(snapshot).length > 0 });
  }
  if (request.method === 'PUT' && pathname === '/api/storage/merge') {
    const body = await readJson(request);
    validateSnapshot(body.base);
    validateSnapshot(body.next);
    const { merged, conflicts } = mergeSnapshots(body.base, body.next, readSnapshot());
    writeSnapshot(merged);
    return sendJson(response, 200, { snapshot: merged, conflicts });
  }
  sendJson(response, 404, { error: 'Not found' });
}

const MIME_TYPES = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function handleStatic(request, response, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(rootDir, relative);
  if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) return sendJson(response, 403, { error: 'Forbidden' });
  const relativeParts = path.relative(rootDir, filePath).split(path.sep);
  const publicFile = relativeParts.length === 1 && ['index.html', 'icon.svg'].includes(relativeParts[0]);
  const publicDirectory = ['css', 'js', 'docs'].includes(relativeParts[0]);
  if (!publicFile && !publicDirectory) return sendJson(response, 403, { error: 'Forbidden' });
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { error: 'Not found' });
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url.pathname);
    else await handleStatic(request, response, url.pathname);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 400, { error: error.message || 'Bad request' });
    else response.destroy();
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
    console.error(`Could not start SQL Visualizer on port ${port}. Stop Live Server or choose another port with PORT=5501.`);
    process.exitCode = 1;
    return;
  }
  console.error('SQL Visualizer server error:', error);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`SQL Visualizer running at http://127.0.0.1:${port}`);
  console.log(`SQLite database: ${dbPath}`);
});

function close() { server.close(() => db.close()); }
process.once('SIGINT', close);
process.once('SIGTERM', close);
