'use strict';

// Durable storage is provided by server.mjs. localStorage remains a synchronous
// browser cache so the existing app can render before the first API response.
(function () {
  const DIRTY_KEY = 'sqlviz.meta.sqliteDirty';
  const debug = (...args) => {
    try { if (localStorage.getItem('sqlviz.debugPersistence') === '1') console.debug('[sqlviz persistence]', ...args); } catch { /* ignore */ }
  };

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
    const requestOptions = { cache: 'no-store', ...options };
    // A final save can be started from pagehide/visibilitychange. keepalive
    // lets the browser finish that small SQLite snapshot while a reload is
    // already in progress instead of restoring the previous layout.
    if (options?.method === 'PUT') requestOptions.keepalive = true;
    debug('request:start', path, requestOptions.method || 'GET', requestOptions.keepalive ? 'keepalive' : 'normal');
    const response = await fetch(path, requestOptions);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Storage request failed (${response.status})`);
    debug('request:done', path, response.status, body.conflicts?.length ? { conflicts: body.conflicts } : 'ok');
    return body;
  }

  async function initialize() {
    let loaded;
    try {
      loaded = await request('/api/storage');
    } catch (error) {
      if (location.protocol === 'file:' || !location.pathname.startsWith('/')) {
        throw new Error('Start the app with "npm start" to enable disk-backed SQLite storage.');
      }
      throw error;
    }
    let baseSnapshot = loaded.snapshot || {};
    debug('initialize:loaded', { hasData: loaded.hasData, keys: Object.keys(baseSnapshot).length });
    let saveChain = Promise.resolve();
    const api = {
      migrated: !loaded.hasData,
      repaired: false,
      snapshot: baseSnapshot,
      localSnapshot,
      replaceLocalSnapshot,
      sameSnapshot,
      save(next) {
        debug('save:queued', { baseKeys: Object.keys(baseSnapshot).length, nextKeys: Object.keys(next).length });
        saveChain = saveChain.catch(() => {}).then(async () => {
          const result = await request('/api/storage/merge', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base: baseSnapshot, next }),
          });
          baseSnapshot = result.snapshot;
          api.snapshot = result.snapshot;
          debug('save:complete', { keys: Object.keys(result.snapshot || {}).length });
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
