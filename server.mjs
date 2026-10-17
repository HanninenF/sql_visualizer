import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.error('SQL Visualizer requires Node.js 22.5 or newer because it uses node:sqlite.');
  process.exit(1);
}

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(rootDir, 'data');
const backupDir = path.join(dataDir, 'backups');
const dbPath = path.join(dataDir, 'sqlviz.sqlite');
const port = Number(process.env.PORT || 5500);
const MAX_BODY = 10 * 1024 * 1024;

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });

function openDatabase() {
  const database = new DatabaseSync(dbPath);
  try {
    database.exec(`
      PRAGMA busy_timeout = 10000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    validateDatabase(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

function validateDatabase(database) {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kv'").all();
  const columns = database.prepare('PRAGMA table_info(kv)').all();
  const validSchema = tables.length === 1
    && columns.length === 2
    && columns[0].name === 'key'
    && columns[0].type.toUpperCase() === 'TEXT'
    && Number(columns[0].pk) === 1
    && columns[1].name === 'value'
    && columns[1].type.toUpperCase() === 'TEXT'
    && Number(columns[1].notnull) === 1;
  if (!validSchema) throw new Error('SQLite kv table has an invalid schema');
  const integrity = database.prepare('PRAGMA integrity_check').all();
  if (integrity[0]?.integrity_check !== 'ok') throw new Error('SQLite integrity check failed');
}

function validateBackup(backupPath) {
  const backup = new DatabaseSync(backupPath);
  try {
    validateDatabase(backup);
  } finally {
    backup.close();
  }
}

function removeJournalFiles() {
  for (const suffix of ['-wal', '-shm']) {
    try { fs.rmSync(dbPath + suffix); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function backupCandidates() {
  return fs.readdirSync(backupDir)
    .filter(name => name.startsWith('sqlviz-') && name.endsWith('.sqlite'))
    .map(name => {
      const filePath = path.join(backupDir, name);
      return { filePath, mtime: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .map(entry => entry.filePath);
}

let db;
try {
  db = openDatabase();
} catch (error) {
  const candidates = backupCandidates();
  if (!candidates.length) throw error;
  let restored = null;
  for (const backupPath of candidates) {
    try {
      validateBackup(backupPath);
      removeJournalFiles();
      fs.copyFileSync(backupPath, dbPath);
      restored = openDatabase();
      console.warn(`SQLite database was restored from ${backupPath}.`);
      break;
    } catch (restoreError) {
      console.warn(`SQLite backup could not be opened: ${backupPath}.`, restoreError);
    }
  }
  if (!restored) throw error;
  db = restored;
}

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

function documentLayoutVersion(value) {
  if (!value || !value.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(value);
    return Number.isInteger(parsed.dataLayoutVersion) ? parsed.dataLayoutVersion : null;
  } catch {
    return null;
  }
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
    // An older open browser tab must not overwrite a newer layout algorithm's
    // document snapshot after a reload. New clients can still update an older
    // snapshot, but an old client may only update non-layout keys through the
    // normal merge path.
    if (key.startsWith('sqlviz.doc.')) {
      // A concurrent client may have the same layout version but an older
      // snapshot. Preserve the latest complete document instead of allowing
      // that client to resurrect stale table positions after a reload.
      if (changedByOther && versionsDiffer) {
        conflicts.push(key);
        continue;
      }
      const nextVersion = documentLayoutVersion(next[key]);
      const latestVersion = documentLayoutVersion(latest[key]);
      if (nextVersion !== null && latestVersion !== null && nextVersion < latestVersion) {
        conflicts.push(key);
        continue;
      }
    }
    if (Object.prototype.hasOwnProperty.call(next, key)) merged[key] = next[key];
    else delete merged[key];
  }
  return { merged, conflicts };
}

function writeSnapshot(snapshot) {
  validateSnapshot(snapshot);
  db.exec('BEGIN;');
  try {
    const existing = readSnapshot();
    const remove = db.prepare('DELETE FROM kv WHERE key = ?');
    const upsert = db.prepare(`
      INSERT INTO kv (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    try {
      for (const key of Object.keys(existing)) if (!(key in snapshot)) remove.run(key);
      for (const [key, value] of Object.entries(snapshot)) {
        if (existing[key] !== value) upsert.run(key, value);
      }
    } finally {
      remove.finalize?.();
      upsert.finalize?.();
    }
    db.exec('COMMIT;');
    queueBackup();
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

function createBackup() {
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.hrtime.bigint()}`;
  const backupPath = path.join(backupDir, `sqlviz-${stamp}.sqlite`);
  const escapedPath = backupPath.replaceAll("'", "''");
  db.exec(`VACUUM INTO '${escapedPath}'`);
  const backups = fs.readdirSync(backupDir)
    .filter(name => name.startsWith('sqlviz-') && name.endsWith('.sqlite'))
    .sort()
    .reverse();
  for (const old of backups.slice(10)) fs.rmSync(path.join(backupDir, old));
}

let backupTimer = 0;
let backupPromise = Promise.resolve();
function queueBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupTimer = 0;
    backupPromise = backupPromise.then(() => createBackup()).catch(error => {
      console.warn('SQLite data was saved, but the backup could not be updated.', error);
    });
  }, 1000);
}
function flushBackup() {
  clearTimeout(backupTimer);
  backupTimer = 0;
  backupPromise = backupPromise.then(() => createBackup()).catch(error => {
    console.warn('SQLite backup could not be finalized.', error);
  });
  return backupPromise;
}

try {
  createBackup();
} catch (error) {
  console.warn('SQLite backup could not be created at startup. The database remains available.', error);
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
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    });
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

function close() { flushBackup().finally(() => server.close(() => db.close())); }
process.once('SIGINT', close);
process.once('SIGTERM', close);
