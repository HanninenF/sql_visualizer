'use strict';

// Durable storage is provided by server.mjs. localStorage remains a synchronous
// browser cache so the existing app can render before the first API response.
(function () {
  const DIRTY_KEY = 'sqlviz.meta.sqliteDirty';

  function localSnapshot() {
    const snapshot = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sqlviz.') && key !== DIRTY_KEY) snapshot[key] = localStorage.getItem(key);
    }
    return snapshot;
  }

  function replaceLocalSnapshot(snapshot) {
    const previous = localSnapshot();
    try {
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

  async function request(path, options) {
    const response = await fetch(path, { cache: 'no-store', ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Storage request failed (${response.status})`);
    return body;
  }

  async function initialize() {
    const loaded = await request('/api/storage');
    let baseSnapshot = loaded.snapshot || {};
    let saveChain = Promise.resolve();
    const api = {
      migrated: !loaded.hasData,
      repaired: false,
      snapshot: baseSnapshot,
      localSnapshot,
      replaceLocalSnapshot,
      sameSnapshot,
      save(next) {
        saveChain = saveChain.catch(() => {}).then(async () => {
          const result = await request('/api/storage/merge', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base: baseSnapshot, next }),
          });
          baseSnapshot = result.snapshot;
          api.snapshot = result.snapshot;
          return result.conflicts || [];
        });
        return saveChain;
      },
    };
    return api;
  }

  window.sqliteStorageReady = initialize().catch(error => {
    console.warn('Server SQLite unavailable; using localStorage fallback.', error);
    return null;
  });
}());
