'use strict';

// SQLite runs in memory through sql.js. IndexedDB stores the serialized SQLite
// database, so the app keeps its durable state in one browser database.
(function () {
  const DB_NAME = 'sqlviz.sqlite';
  const STORE_NAME = 'database';
  const KEY = 'main';
  const WASM_URL = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm';

  function openIndexedDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function readBytes(idb) {
    return new Promise((resolve, reject) => {
      const request = idb.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }
  function writeBytes(idb, bytes) {
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(bytes, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  function localSnapshot() {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sqlviz.')) result[key] = localStorage.getItem(key);
    }
    return result;
  }
  function replaceLocalSnapshot(snapshot) {
    Object.keys(localSnapshot()).forEach(key => localStorage.removeItem(key));
    Object.entries(snapshot).forEach(([key, value]) => localStorage.setItem(key, value));
  }
  function sameSnapshot(a, b) {
    const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
    return ak.length === bk.length && ak.every((key, i) => key === bk[i] && a[key] === b[key]);
  }
  function readSqliteSnapshot(db) {
    const result = {};
    const rows = db.exec('SELECT key, value FROM kv');
    for (const row of rows[0]?.values ?? []) result[row[0]] = row[1];
    return result;
  }
  function writeSqliteSnapshot(db, snapshot) {
    db.run('BEGIN;');
    try {
      db.run('DELETE FROM kv;');
      const statement = db.prepare('INSERT INTO kv (key, value) VALUES (?, ?);');
      for (const [key, value] of Object.entries(snapshot)) statement.run([key, value]);
      statement.free();
      db.run('COMMIT;');
    } catch (error) {
      db.run('ROLLBACK;');
      throw error;
    }
  }
  async function initialize() {
    if (typeof initSqlJs !== 'function') throw new Error('SQLite WebAssembly library is unavailable');
    const SQL = await initSqlJs({ locateFile: () => WASM_URL });
    const idb = await openIndexedDb();
    const bytes = await readBytes(idb);
    const db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
    db.run('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
    const hasRows = (db.exec('SELECT COUNT(*) AS count FROM kv')[0]?.values[0]?.[0] ?? 0) > 0;
    const migrated = !bytes || !hasRows;
    if (migrated) writeSqliteSnapshot(db, localSnapshot());
    const snapshot = readSqliteSnapshot(db);
    await writeBytes(idb, db.export());
    let saveChain = Promise.resolve();
    return { migrated, snapshot, localSnapshot, replaceLocalSnapshot, sameSnapshot,
      save(next) {
        saveChain = saveChain.catch(() => {}).then(async () => {
          writeSqliteSnapshot(db, next);
          await writeBytes(idb, db.export());
        });
        return saveChain;
      } };
  }
  window.sqliteStorageReady = initialize().catch(error => {
    console.warn('SQLite storage unavailable; using localStorage fallback.', error);
    return null;
  });
}());
