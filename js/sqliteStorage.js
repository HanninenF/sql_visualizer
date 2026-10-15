'use strict';

// SQLite runs in memory through sql.js. IndexedDB stores the serialized SQLite
// database, so the app keeps its durable state in one browser database.
(function () {
  const DB_NAME = 'sqlviz.sqlite';
  const STORE_NAME = 'database';
  const KEY = 'main';
  const DIRTY_KEY = 'sqlviz.meta.sqliteDirty';
  const WASM_URL = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.wasm';

  function openIndexedDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  // The updater runs while the readwrite transaction is active. IndexedDB
  // serializes these transactions across tabs, so snapshots cannot be lost
  // between the read and the write.
  function updateBytes(idb, updater) {
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      const objectStore = tx.objectStore(STORE_NAME);
      const request = objectStore.get(KEY);
      let result;
      let failure = null;
      request.onsuccess = () => {
        try {
          const update = updater(request.result ?? null);
          result = update.result;
          objectStore.put(update.bytes, KEY);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      request.onerror = () => {
        failure = request.error;
        tx.abort();
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(failure ?? tx.error);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  }
  function localSnapshot() {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sqlviz.') && key !== DIRTY_KEY) result[key] = localStorage.getItem(key);
    }
    return result;
  }
  function replaceLocalSnapshot(snapshot) {
    const previous = localSnapshot();
    try {
      // Write first so a quota error does not erase the existing snapshot.
      Object.entries(snapshot).forEach(([key, value]) => localStorage.setItem(key, value));
      Object.keys(previous).filter(key => !(key in snapshot)).forEach(key => localStorage.removeItem(key));
    } catch (error) {
      try {
        Object.keys(localSnapshot()).forEach(key => localStorage.removeItem(key));
        Object.entries(previous).forEach(([key, value]) => localStorage.setItem(key, value));
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      throw error;
    }
  }
  function sameSnapshot(a, b) {
    const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
    return ak.length === bk.length && ak.every((key, i) => key === bk[i] && a[key] === b[key]);
  }
  function mergeSnapshots(base, next, latest) {
    const merged = { ...latest };
    const keys = new Set([...Object.keys(base), ...Object.keys(next)]);
    for (const key of keys) {
      const baseHas = Object.prototype.hasOwnProperty.call(base, key);
      const nextHas = Object.prototype.hasOwnProperty.call(next, key);
      if (baseHas === nextHas && (!baseHas || base[key] === next[key])) continue;
      if (nextHas) merged[key] = next[key];
      else delete merged[key];
    }
    return merged;
  }
  function ensureSchema(db) {
    db.run('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
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
    const initialized = await updateBytes(idb, bytes => {
      let db;
      let repaired = false;
      try {
        db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
        ensureSchema(db);
      } catch (error) {
        console.warn('SQLite database was corrupt; rebuilding it from localStorage.', error);
        db?.close?.();
        db = new SQL.Database();
        ensureSchema(db);
        repaired = true;
      }
      const hasRows = (db.exec('SELECT COUNT(*) AS count FROM kv')[0]?.values[0]?.[0] ?? 0) > 0;
      const migrated = repaired || !bytes || !hasRows;
      if (migrated) writeSqliteSnapshot(db, localSnapshot());
      const snapshot = readSqliteSnapshot(db);
      const result = { migrated, repaired, snapshot };
      const exported = db.export();
      db.close?.();
      return { bytes: exported, result };
    });
    const { migrated, repaired, snapshot } = initialized;
    let baseSnapshot = snapshot;
    let saveChain = Promise.resolve();
    const api = { migrated, repaired, snapshot, localSnapshot, replaceLocalSnapshot, sameSnapshot,
      save(next) {
        saveChain = saveChain.catch(() => {}).then(async () => {
          const update = await updateBytes(idb, latestBytes => {
            const latestDb = latestBytes ? new SQL.Database(new Uint8Array(latestBytes)) : new SQL.Database();
            try {
              ensureSchema(latestDb);
              const latest = readSqliteSnapshot(latestDb);
              const merged = mergeSnapshots(baseSnapshot, next, latest);
              writeSqliteSnapshot(latestDb, merged);
              return { bytes: latestDb.export(), result: merged };
            } finally {
              latestDb.close?.();
            }
          });
          baseSnapshot = update;
          api.snapshot = update;
        });
        return saveChain;
      } };
    return api;
  }
  window.sqliteStorageReady = initialize().catch(error => {
    console.warn('SQLite storage unavailable; using localStorage fallback.', error);
    return null;
  });
}());
