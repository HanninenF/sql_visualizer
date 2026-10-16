'use strict';

// ─── Editor ──────────────────────────────────────────────────────────────────

const ta = $('#src'), hl = $('#hl'), gutter = $('#gutter');

function hlTextLine(line, st = {}, lineNumber = 0, dataLines, dataRowLines) {
  const hash = line.indexOf('#');
  const code = hash >= 0 ? line.slice(0, hash) : line;
  const com = hash >= 0 ? `<span class="h-com">${esc(line.slice(hash))}</span>` : '';
  if (!code.trim()) {
    st.inData = false;
    return esc(code) + com;
  }
  if (/^\s*@data\s*$/i.test(code)) {
    st.inData = true;
    return `<span class="h-flag">${esc(code)}</span>` + com;
  }
  if (dataLines?.has(lineNumber)) {
    if (dataRowLines?.has(lineNumber)) {
      const m = code.match(/^(\s*\d+)(\s*,[\s\S]*)$/);
      if (m) return `<span class="h-data-id">${esc(m[1])}</span><span class="h-data">${esc(m[2])}</span>` + com;
    }
    return `<span class="h-data">${esc(code)}</span>` + com;
  }
  if (st.inData && /^(\s*\d+)(\s*,[\s\S]*)$/.test(code)) {
    const m = code.match(/^(\s*\d+)(\s*,[\s\S]*)$/);
    return `<span class="h-data-id">${esc(m[1])}</span><span class="h-data">${esc(m[2])}</span>` + com;
  }
  if (st.inData && (/^\s/.test(code) || code.includes(',') || /^\d{1,3}:\d{2}(?::\d{2})?$/.test(code.trim())))
    return `<span class="h-data">${esc(code)}</span>` + com;
  if (st.inData) st.inData = false;
  if (!/^\s/.test(code)) {
    const cls = RESERVED.has(code.trim().toUpperCase()) ? 'h-reserved' : 'h-tbl';
    return `<span class="${cls}">${esc(code)}</span>` + com;
  }
  const ai = code.indexOf('->');
  const left = ai >= 0 ? code.slice(0, ai) : code;
  const m = left.match(/^(\s*)(\S*)([\s\S]*)$/);
  const colCls = RESERVED.has(m[2].toUpperCase()) ? 'h-reserved' : 'h-col';
  let h = esc(m[1]) + `<span class="${colCls}">${esc(m[2])}</span>`;
  h += m[3].split(/(\s+)/).map(p =>
    !p.trim() ? esc(p) : FLAG.test(p) ? `<span class="h-flag">${esc(p)}</span>` : `<span class="h-type">${esc(p)}</span>`).join('');
  if (ai >= 0) h += `<span class="h-arrow">-&gt;</span><span class="h-ref">${esc(code.slice(ai + 2))}</span>`;
  return h + com;
}

const SQL_KW = new Set(`CREATE TABLE INSERT INTO VALUES PRIMARY KEY FOREIGN REFERENCES NOT NULL AUTO_INCREMENT UNIQUE DROP IF EXISTS SET
ALTER ADD CONSTRAINT DEFAULT INDEX ON DELETE UPDATE CASCADE COLUMN ENGINE CHARSET COLLATE CHECK`.split(/\s+/));
const SQL_NAME_SUGGESTIONS = {
  RELEASE: ['Edition', 'Album', 'Record', 'Pressing', 'Version'],
};
const SQL_TYPES = /^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|BIT|BOOL|BOOLEAN|CHAR|VARCHAR|TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT|BLOB|DATE|DATETIME|TIMESTAMP|TIME|YEAR|ENUM|SET|JSON|UNSIGNED)$/i;

function reservedIdentifierAtCaret() {
  if (state?.mode && state.mode !== 'text') return null;
  const at = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\n', Math.max(0, at - 1)) + 1;
  const nextBreak = ta.value.indexOf('\n', at);
  const lineEnd = nextBreak < 0 ? ta.value.length : nextBreak;
  const code = ta.value.slice(lineStart, lineEnd).split('#', 1)[0];
  const match = code.match(/^(\s*)(\S+)/);
  if (!match) return null;
  const name = match[2];
  if (!RESERVED.has(name.toUpperCase()) || !SQL_NAME_SUGGESTIONS[name.toUpperCase()]) return null;
  const start = lineStart + match[1].length;
  const end = start + name.length;
  if (at < start || at > end) return null;
  return { name, start, end, suggestions: SQL_NAME_SUGGESTIONS[name.toUpperCase()] };
}

function updateIdentifierHint() {
  const hint = $('#identifierHint');
  const match = reservedIdentifierAtCaret();
  if (!match) { hint.hidden = true; hint.replaceChildren(); return; }
  hint.innerHTML = `<p><code>${esc(match.name)}</code> is a SQL keyword. Did you mean one of these?</p>` +
    `<div class="hint-options">${match.suggestions.map(s => `<button type="button" data-name="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  hint.hidden = false;
  hint.querySelectorAll('button').forEach(button => button.onclick = () => {
    const current = reservedIdentifierAtCaret();
    if (!current) return;
    ta.setSelectionRange(current.start, current.end);
    ta.setRangeText(button.dataset.name, current.start, current.end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  });
}

ta.addEventListener('keyup', updateIdentifierHint);
ta.addEventListener('click', updateIdentifierHint);
// st carries a /* comment */ that is still open over to the next line
function hlSqlLine(line, st = {}) {
  let out = '', last = 0;
  if (st.inComment) {
    const end = line.indexOf('*/');
    last = end < 0 ? line.length : end + 2;
    out = `<span class="h-com">${esc(line.slice(0, last))}</span>`;
    if (end < 0) return out;
    st.inComment = false;
  }
  const re = /(--.*$|#.*$|\/\*.*?(?:\*\/|$))|('(?:[^'\\]|\\.|'')*'?|"(?:[^"\\]|\\.|"")*"?)|(`[^`]*`?)|([\p{L}_][\p{L}\p{N}_$]*)/gu;
  re.lastIndex = last; // matchAll starts from here
  for (const m of line.matchAll(re)) {
    out += esc(line.slice(last, m.index));
    if (m[1]) {
      out += `<span class="h-com">${esc(m[1])}</span>`;
      if (m[1].startsWith('/*') && !(m[1].length >= 4 && m[1].endsWith('*/'))) st.inComment = true;
    } else if (m[2]) out += `<span class="h-str">${esc(m[2])}</span>`;
    else if (m[4] && SQL_KW.has(m[4].toUpperCase())) out += `<span class="h-kw">${esc(m[4])}</span>`;
    else if (m[4] && SQL_TYPES.test(m[4])) out += `<span class="h-type">${esc(m[4])}</span>`;
    else out += esc(m[0]);
    last = m.index + m[0].length;
  }
  return out + esc(line.slice(last));
}

function decorateEditor(problems, parsed = {}) {
  const byLine = new Map();
  for (const p of problems) {
    const prev = byLine.get(p.line);
    if (!prev || (prev.level === 'warn' && p.level === 'error')) byLine.set(p.line, p);
  }
  const lines = ta.value.split('\n');
  const hlLine = state.mode === 'text' ? hlTextLine : hlSqlLine, hlState = {};
  // one block per line, so a wrapped line's real height can be measured
  hl.innerHTML = lines.map((l, i) => {
    const p = byLine.get(i + 1);
    const h = hlLine(l, hlState, i + 1, parsed.dataLines, parsed.dataRowLines);
    if (!p || !l.trim()) return `<div>${h || '<br>'}</div>`;
    const lead = l.match(/^\s*/)[0];
    return `<div>${lead}<span class="h-${p.level}">${h.slice(lead.length)}</span></div>`;
  }).join('');
  // with word wrap, each line number is as tall as its (wrapped) line
  const rows = state.wrap ? [...hl.children].map(d => d.offsetHeight) : null;
  gutter.innerHTML = lines.map((_, i) => {
    const p = byLine.get(i + 1), h = rows ? ` style="height:${rows[i]}px"` : '';
    return p ? `<div class="${p.level}" title="${esc(p.msg)}"${h}>${i + 1}</div>` : `<div${h}>${i + 1}</div>`;
  }).join('');
  lastProblems = problems;
  updateStatus(problems);
  syncScroll();
}

let lastProblems = [];
const redecorate = () => decorateEditor(lastProblems);

// Status bar: the first problem (click to jump there), and the diagram's size
let firstProblem = null;
function updateStatus(problems) {
  const sorted = [...problems].sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.level === 'error' ? -1 : 1));
  firstProblem = sorted[0] ?? null;
  const btn = $('#statusBtn'), n = problems.length;
  btn.classList.toggle('has-problems', n > 0);
  btn.classList.toggle('error', problems.some(p => p.level === 'error'));
  btn.classList.toggle('warn', n > 0 && !problems.some(p => p.level === 'error'));
  $('#statusText').textContent = !n
    ? (state.mode === 'sql' ? 'MariaDB · No problems' : 'No problems')
    : `${n} problem${n > 1 ? 's' : ''} · ${firstProblem.line ? 'Line ' + firstProblem.line + ': ' : ''}${firstProblem.msg}`;
  $('#statusText').title = n ? 'Click to see all problems' : '';
  // the expandable list of every problem (closes by itself when there are none)
  $('#problemList').innerHTML = sorted.map(p =>
    `<button class="problem ${p.level}" role="listitem" data-line="${p.line ?? ''}">` +
    `<span class="dot"></span><span class="where">${p.line ? 'Line ' + p.line : ''}</span>` +
    `<span>${esc(p.msg)}</span></button>`).join('');
  if (!n) setProblemList(false);
  const tables = model.tables ?? [];
  const rels = tables.reduce((k, t) => k + t.cols.filter(c => c.target).length, 0);
  $('#summary').textContent = `${tables.length} table${tables.length === 1 ? '' : 's'} · ${rels} relation${rels === 1 ? '' : 's'}`;
}
function setProblemList(open) {
  $('#problemList').hidden = !open;
  $('#statusBtn').setAttribute('aria-expanded', String(open));
}
$('#statusBtn').onclick = () => { if (firstProblem) setProblemList($('#problemList').hidden); };
$('#problemList').addEventListener('click', e => {
  const b = e.target.closest('.problem');
  if (b?.dataset.line) selectLine(+b.dataset.line);
});
$('#problemList').addEventListener('keydown', e => { if (e.key === 'Escape') { setProblemList(false); $('#statusBtn').focus(); } });

function syncScroll() {
  hl.scrollTop = ta.scrollTop;
  hl.scrollLeft = ta.scrollLeft;
  gutter.scrollTop = ta.scrollTop;
}

function selectLine(n) {
  setHelp(false);
  const lines = ta.value.split('\n');
  if (!n || n > lines.length) return;
  let start = 0;
  for (let i = 0; i < n - 1; i++) start += lines[i].length + 1;
  ta.focus();
  ta.setSelectionRange(start, start + lines[n - 1].length);
  const lh = lineHeight();
  const top = state.wrap ? hl.children[n - 1].offsetTop - hl.children[0].offsetTop : (n - 1) * lh;
  if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - 3 * lh) ta.scrollTop = Math.max(0, top - 3 * lh);
  syncScroll();
}

function insertText(s) {
  if (!document.execCommand('insertText', false, s)) {
    ta.setRangeText(s, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input'));
  }
}

ta.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    insertText('  ');
  } else if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && state.mode === 'text') {
    // auto-indent: after a table name, indent; inside a table, keep the indentation
    const before = ta.value.slice(0, ta.selectionStart);
    const cur = before.slice(before.lastIndexOf('\n') + 1);
    const code = cur.replace(/#.*$/, '');
    const indent = !code.trim() ? cur.match(/^\s*/)[0] : /^\s/.test(code) ? code.match(/^\s*/)[0] : '  ';
    e.preventDefault();
    insertText('\n' + indent);
  }
});
ta.addEventListener('scroll', syncScroll);
// A paste that replaces everything (all selected, or the editor empty; blank lines
// left outside the selection don't count) is a new schema: lay it out from scratch
let pastedAll = false;
ta.addEventListener('paste', () => {
  pastedAll = !ta.value.slice(0, ta.selectionStart).trim() && !ta.value.slice(ta.selectionEnd).trim();
  setTimeout(() => { pastedAll = false; }); // a paste that inserted nothing has no input event
});
ta.addEventListener('input', () => {
  clearImmutableLayout();
  histTyping();
  if (state.mode === 'text') { state.text = ta.value; state.sqlStale = true; }
  else { state.sql = ta.value; state.textStale = true; }
  update();
  updateIdentifierHint();
  if (pastedAll) { pastedAll = false; dataPos = null; autoLayout(); fit(); }
  saveState();
});

// ─── State ───────────────────────────────────────────────────────────────────

// Everything is saved in the browser's localStorage:
//   sqlviz.settings   preferences shared by all tabs (theme, text size, notation, editor width)
//   sqlviz.docs       the tabs: { list: [{ id, name }], active, closed: [{ id, name }] }
//   sqlviz.doc.<id>   one diagram: text, SQL, mode, box positions and the view (pan/zoom)
// `state` holds the preferences plus the active diagram's fields; `pos` its box positions.
const SETTINGS = ['colors', 'fontSize', 'wrap', 'notation', 'implicit', 'keysOnly', 'dataView', 'panel', 'leftW'];
const DATA_LAYOUT_VERSION = 13;
// base: the text the diagram was created with (an example, or empty), to tell whether it has changed
const DOC_DEFAULTS = { text: '', sql: '', mode: 'text', textStale: false, sqlStale: true, base: null };
const SQLITE_DIRTY_KEY = 'sqlviz.meta.sqliteDirty';
const persistenceDebug = (...args) => {
  try { if (localStorage.getItem('sqlviz.debugPersistence') === '1') console.debug('[sqlviz persistence]', ...args); } catch { /* ignore */ }
};
const docKey = id => 'doc.' + id;
const newDocId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// a new diagram is named after its first comment line ("# School database")
const docNameFrom = text => (text.match(/^#\s*(.+)$/m)?.[1].trim().slice(0, 40)) || 'Untitled';

let docs = store.get('docs', null);
if (!docs?.list?.length) {
  // first visit, or data saved by the single-diagram version: that becomes the first tab
  const old = store.get('state', null);
  const text = old?.text ?? EXAMPLES.school;
  const id = newDocId();
  store.set(docKey(id), { ...DOC_DEFAULTS, ...(old && Object.fromEntries(Object.keys(DOC_DEFAULTS).filter(k => k in old).map(k => [k, old[k]]))), text, base: old ? null : text, pos: store.get('pos', {}), savedPos: {} });
  if (old) store.set('settings', Object.fromEntries(SETTINGS.filter(k => k in old).map(k => [k, old[k]])));
  docs = { list: [{ id, name: docNameFrom(text) }], active: id, closed: [] };
  store.set('docs', docs);
  store.remove('state');
  store.remove('pos');
}
if (!docs.list.some(d => d.id === docs.active)) docs.active = docs.list[0].id;
if (!Array.isArray(docs.closed)) docs.closed = [];
let persistedDocs = structuredClone(docs);
const documentTransforms = [];
const normalizeDocData = data => documentTransforms.reduce((d, transform) => transform(d), data);

// Merge this window's changes with other windows instead of replacing their whole tab list.
function syncDocs(remote = store.get('docs', docs)) {
  if (!remote?.list?.length) return;
  const base = new Map(persistedDocs.list.map(d => [d.id, d]));
  const incoming = new Map(remote.list.map(d => [d.id, d]));
  const localIds = new Set(docs.list.map(d => d.id));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const merged = [];
  for (const entry of docs.list) {
    const old = base.get(entry.id), next = incoming.get(entry.id);
    if (old && !next && entry.id !== docs.active && equal(entry, old)) continue;
    if (old && next) {
      for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
        if (key === 'id' || !equal(entry[key], old[key])) continue;
        if (key in next) entry[key] = structuredClone(next[key]);
        else delete entry[key];
      }
    }
    merged.push(entry);
  }
  for (const entry of remote.list) {
    if (!localIds.has(entry.id) && !base.has(entry.id)) merged.push(structuredClone(entry));
  }
  const baseClosed = new Map((persistedDocs.closed ?? []).map(d => [d.id, d]));
  const incomingClosed = new Map((remote.closed ?? []).map(d => [d.id, d]));
  const localClosed = new Map((docs.closed ?? []).map(d => [d.id, d]));
  const mergedIds = new Set(merged.map(d => d.id));
  const closed = new Map();
  for (const [id, entry] of localClosed) {
    if (!mergedIds.has(id)) closed.set(id, structuredClone(entry));
  }
  for (const [id, entry] of incomingClosed) {
    if (mergedIds.has(id)) continue;
    const old = baseClosed.get(id), local = localClosed.get(id);
    closed.set(id, local && old && !equal(local, old) ? structuredClone(local) : structuredClone(entry));
  }
  docs.list.splice(0, docs.list.length, ...merged);
  docs.closed = [...closed.values()];
  persistedDocs = structuredClone(remote);
}
window.addEventListener('storage', e => {
  if (e.key !== 'sqlviz.docs' || !e.newValue) return;
  try { syncDocs(JSON.parse(e.newValue)); renderTabs(); } catch { /* ignore malformed storage */ }
});

const state = Object.assign({
  colors: 'bleak', fontSize: 13, wrap: true, notation: 'arrows', implicit: false, keysOnly: false, dataView: false, panel: 'mid', leftW: null, ...DOC_DEFAULTS,
}, store.get('settings', {}));
let pos = {};
let schemaPos = {};
let dataPos = null;
let dataLayoutSchemaFingerprint = null;
let dataLayoutUserEdited = false;
let savedPos = {};
let docView = null; // legacy single pan/zoom value from older documents
let schemaViewState = null;
let dataViewState = null;
let model = { tables: [] };
let prevNames = null; // table names at the last draw (null: just loaded)
const positionSnapshot = source => Object.fromEntries(Object.entries(source ?? {}).filter(([, p]) =>
  Number.isFinite(p?.x) && Number.isFinite(p?.y)).map(([name, p]) => [name, { x: p.x, y: p.y }]));
const positionFingerprint = source => JSON.stringify(Object.entries(positionSnapshot(source))
  .sort(([a], [b]) => a === b ? 0 : a < b ? -1 : 1));
// Kept outside the `sqlviz.` namespace so SQLite autosaves cannot overwrite it
// during startup. It represents the last explicit data-layout snapshot.
const IMMUTABLE_LAYOUT_PREFIX = 'sqlvizLayout.';
const IMMUTABLE_LAYOUT_VERSION = 4;
const immutableLayoutKey = id => `${IMMUTABLE_LAYOUT_PREFIX}${id}`;
const layoutSource = value => value?.mode === 'sql' ? (value.sql ?? '') : (value?.text ?? '');
function layoutSourceFingerprint(source) {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${hash >>> 0}:${source.length}`;
}
function readImmutableLayout(id) {
  try {
    const raw = localStorage.getItem(immutableLayoutKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearImmutableLayout(id = docs.active) {
  try { localStorage.removeItem(immutableLayoutKey(id)); } catch { /* best effort */ }
}
function writeImmutableLayout(id = docs.active) {
  if (!id || !schemaPos || !dataPos) return false;
  const snapshot = {
    version: IMMUTABLE_LAYOUT_VERSION,
    sourceFingerprint: layoutSourceFingerprint(layoutSource(state)),
    fingerprint: positionFingerprint(schemaPos),
    dataPos: positionSnapshot(dataPos),
  };
  try {
    localStorage.setItem(immutableLayoutKey(id), JSON.stringify(snapshot));
    return true;
  } catch { return false; }
}

function readDoc(id) {
  const d = normalizeDocData(store.get(docKey(id), null) ?? {});
  for (const k of Object.keys(DOC_DEFAULTS)) state[k] = d[k] ?? DOC_DEFAULTS[k];
  // Positions are persisted data, so never trust their object shape. Older
  // layout code wrote intermediate/prefix keys (R, Ra, Record...) and extra
  // solver metadata. Keep only finite coordinates for exact table names.
  const storedSchemaPos = positionSnapshot(d.pos);
  savedPos = positionSnapshot(d.savedPos);
  // A saved layout is the document's canonical starting layout after reload.
  // Keep any positions that were added after the snapshot so newly added tables
  // can still be placed without losing their last known position.
  schemaPos = { ...storedSchemaPos };
  for (const [name, point] of Object.entries(savedPos)) schemaPos[name] = { ...point };
  dataPos = d.dataLayoutVersion === DATA_LAYOUT_VERSION
    ? positionSnapshot(d.dataPos)
    : null;
  if (!Object.keys(dataPos ?? {}).length) dataPos = null;
  dataLayoutSchemaFingerprint = d.dataLayoutSchemaFingerprint ?? null;
  dataLayoutUserEdited = d.dataLayoutUserEdited === true;
  if (dataPos && dataLayoutSchemaFingerprint !== positionFingerprint(schemaPos)) {
    dataPos = null;
    dataLayoutSchemaFingerprint = null;
  }
  const immutable = readImmutableLayout(id);
  if (immutable?.version === IMMUTABLE_LAYOUT_VERSION &&
      immutable.sourceFingerprint === layoutSourceFingerprint(layoutSource(d)) &&
      immutable.fingerprint === positionFingerprint(schemaPos)) {
    const cached = positionSnapshot(immutable.dataPos);
    if (Object.keys(cached).length) {
      dataPos = cached;
      dataLayoutSchemaFingerprint = immutable.fingerprint;
      persistenceDebug('readDoc:immutable-layout', { id, positions: Object.keys(cached).length });
    }
  }
  // Data view has its own saved positions. Keep those across reloads instead
  // of rebuilding the cards from the schema positions every time.
  pos = state.dataView && dataPos ? dataPos : state.dataView ? {} : schemaPos;
  if (typeof updateLayoutButtons === 'function') updateLayoutButtons();
  docView = d.view ?? null;
  schemaViewState = d.schemaViewport ?? (!state.dataView ? docView : null);
  dataViewState = d.dataViewport ?? (state.dataView ? docView : null);
  persistenceDebug('readDoc', { id, dataView: state.dataView, dataLayoutVersion: d.dataLayoutVersion,
    schemaPositions: Object.keys(schemaPos).length, dataPositions: Object.keys(dataPos || {}).length,
    savedPositions: Object.keys(savedPos).length,
    sample: { Record: dataPos?.Record, Edition: dataPos?.Edition, Song: dataPos?.Song } });
}
readDoc(docs.active);

function sanitizePositionsForModel() {
  const names = new Set((model.tables ?? []).map(t => t.name));
  const clean = value => Object.fromEntries(Object.entries(value ?? {})
    .filter(([name, point]) => names.has(name) && Number.isFinite(point?.x) && Number.isFinite(point?.y))
    .map(([name, point]) => [name, { x: point.x, y: point.y }]));
  schemaPos = clean(schemaPos);
  savedPos = clean(savedPos);
  dataPos = dataPos ? clean(dataPos) : null;
  pos = clean(pos);
}

function viewSnapshot() {
  return { tx: view.tx, ty: view.ty, s: view.s };
}
function restoreViewSnapshot(snapshot) {
  if (!snapshot || ![snapshot.tx, snapshot.ty, snapshot.s].every(Number.isFinite)) return false;
  Object.assign(view, snapshot);
  applyView();
  return true;
}

function applySavedLayoutDefault() {
  if (state.dataView || !Object.keys(savedPos).length) return;
  for (const [name, point] of Object.entries(savedPos)) {
    const clean = { x: point.x, y: point.y };
    schemaPos[name] = clean;
    pos[name] = { ...clean };
  }
  drawDiagram();
}

// A data layout is derived from the canonical saved schema layout. Rebuild it
// when no current data snapshot exists so stale positions cannot override it.
function applyDataLayoutDefault() {
  if (!state.dataView || dataPos || !model.tables?.length) return false;
  pos = {};
  drawDiagram();
  arrangeAll(model.tables, geometry.dims);
  dataLayoutUserEdited = false;
  dataPos = positionSnapshot(pos);
  drawDiagram();
  saveDoc();
  return true;
}

function restoreStoredDataPositions() {
  if (!state.dataView || !dataPos) return;
  pos = structuredClone(dataPos);
  drawDiagram();
}

function migrateStoredLayoutSnapshot(snapshot) {
  const next = { ...snapshot };
  let changed = false;
  for (const [key, value] of Object.entries(next)) {
    if (!key.startsWith('sqlviz.doc.')) continue;
    try {
      const doc = JSON.parse(value);
      if (!doc || typeof doc !== 'object' || doc.dataLayoutVersion === DATA_LAYOUT_VERSION) continue;
      // The old data positions were generated by a different algorithm. They
      // must not be restored after a hard reload; the current build derives a
      // fresh compact layout from the canonical schema positions.
      doc.dataPos = null;
      doc.dataLayoutVersion = DATA_LAYOUT_VERSION;
      next[key] = JSON.stringify(doc);
      changed = true;
    } catch { /* malformed documents are handled by normal document recovery */ }
  }
  return { snapshot: next, changed };
}

// SQLite is authoritative once it has been initialized. A first run migrates
// the existing localStorage snapshot; later runs restore SQLite's snapshot
// before the app continues using localStorage as its synchronous cache.
window.sqliteStorageReady?.then(async storage => {
  const restoreFlag = 'sqlviz.sqliteRestorePending';
  if (!storage) {
    persistenceDebug('startup:no-sqlite');
    sqliteReadyForWrites = true;
    setTimeout(() => toast('Disk storage is unavailable. Start the app with "npm start"; localStorage fallback is active.'), 0);
    return;
  }
  if (storage.migrated) {
    persistenceDebug('startup:migrate-local-to-sqlite');
    const dirtyToken = localStorage.getItem(SQLITE_DIRTY_KEY);
    reportSqliteConflicts(await storage.save(storage.localSnapshot()));
    if (dirtyToken && localStorage.getItem(SQLITE_DIRTY_KEY) === dirtyToken)
      localStorage.removeItem(SQLITE_DIRTY_KEY);
    sessionStorage.removeItem(restoreFlag);
    enableSqliteWrites();
    return;
  }
  const storedLayoutMigration = migrateStoredLayoutSnapshot(storage.snapshot);
  if (storedLayoutMigration.changed) {
    persistenceDebug('startup:migrate-sqlite-layout', { version: DATA_LAYOUT_VERSION });
    reportSqliteConflicts(await storage.save(storedLayoutMigration.snapshot));
  }
  // A new origin (for example after moving from Live Server to another port)
  // has an empty localStorage even though the shared SQLite file has all
  // documents. Restore that cache before considering dirty/restore flags.
  const localSnapshot = storage.localSnapshot();
  let localDocs = null;
  let sqliteDocs = null;
  try { localDocs = JSON.parse(localSnapshot['sqlviz.docs'] ?? 'null'); } catch { /* ignore */ }
  try { sqliteDocs = JSON.parse(storage.snapshot['sqlviz.docs'] ?? 'null'); } catch { /* ignore */ }
  if (sqliteDocs?.list?.length && !localDocs?.list?.length) {
    persistenceDebug('startup:restore-empty-origin', {
      sqliteDocuments: sqliteDocs.list.length,
      localDocuments: localDocs?.list?.length ?? 0,
    });
    sessionStorage.removeItem(restoreFlag);
    storage.replaceLocalSnapshot(storage.snapshot);
    window.location.reload();
    return;
  }
  const activeLocal = localDocs?.active ? localSnapshot[`sqlviz.doc.${localDocs.active}`] : null;
  let localHasCurrentDocument = false;
  try {
    const localDoc = activeLocal ? JSON.parse(activeLocal) : null;
    localHasCurrentDocument = localDoc?.dataLayoutVersion === DATA_LAYOUT_VERSION;
  } catch { /* normal recovery below */ }
  if (localDocs?.list?.length && localHasCurrentDocument) {
    if (!storage.sameSnapshot(storage.snapshot, localSnapshot)) {
      persistenceDebug('startup:existing-local-wins');
      reportSqliteConflicts(await storage.save(localSnapshot));
    }
    sessionStorage.removeItem(restoreFlag);
    enableSqliteWrites();
    return;
  }
  // Once this origin has a current layout, prefer it over an older SQLite
  // snapshot. This is important during a hard reload: the browser cache can
  // contain the just-finished layout save while the durable request is still
  // being reconciled with another client.
  const activeLocalDoc = localDocs?.active ? localSnapshot[`sqlviz.doc.${localDocs.active}`] : null;
  const activeStoredDoc = sqliteDocs?.active ? storage.snapshot[`sqlviz.doc.${sqliteDocs.active}`] : null;
  try {
    const localDoc = activeLocalDoc ? JSON.parse(activeLocalDoc) : null;
    const storedDoc = activeStoredDoc ? JSON.parse(activeStoredDoc) : null;
    if (localDoc?.dataLayoutVersion === DATA_LAYOUT_VERSION && localDoc.dataPos &&
        storedDoc?.dataLayoutVersion === DATA_LAYOUT_VERSION &&
        JSON.stringify(localDoc.dataPos) !== JSON.stringify(storedDoc.dataPos)) {
      persistenceDebug('startup:local-layout-wins');
      reportSqliteConflicts(await storage.save(localSnapshot));
      sessionStorage.removeItem(restoreFlag);
      enableSqliteWrites();
      return;
    }
  } catch { /* malformed snapshots follow the normal recovery path */ }
  // A dirty local snapshot represents an edit made before a reload. It must be
  // uploaded before SQLite is considered for restoration; otherwise a reload
  // can replace a freshly moved table with the previous durable layout.
  const dirtyToken = localStorage.getItem(SQLITE_DIRTY_KEY);
  if (dirtyToken) {
    persistenceDebug('startup:dirty-local-wins', { token: dirtyToken });
    reportSqliteConflicts(await storage.save(storage.localSnapshot()));
    if (localStorage.getItem(SQLITE_DIRTY_KEY) === dirtyToken)
      localStorage.removeItem(SQLITE_DIRTY_KEY);
    sessionStorage.removeItem(restoreFlag);
    enableSqliteWrites();
    return;
  }
  // With no unsynced local edit, SQLite is authoritative and can restore the
  // browser cache when the two snapshots differ.
  if (storage.sameSnapshot(storage.snapshot, storage.localSnapshot())) {
    persistenceDebug('startup:snapshots-identical');
    sessionStorage.removeItem(restoreFlag);
    enableSqliteWrites();
    return;
  }
  if (sessionStorage.getItem(restoreFlag) === '1') {
    persistenceDebug('startup:restore-aborted-after-retry');
    sessionStorage.removeItem(restoreFlag);
    toast('SQLite restore needs attention. The current browser cache was kept.');
    console.warn('SQLite and localStorage still differ after one restore; reload stopped.');
    enableSqliteWrites();
    return;
  }
  sessionStorage.setItem(restoreFlag, '1');
  persistenceDebug('startup:restore-sqlite-to-local');
  storage.replaceLocalSnapshot(storage.snapshot);
  window.location.reload();
}).catch(error => {
  sessionStorage.removeItem('sqlviz.sqliteRestorePending');
  sqliteReadyForWrites = true;
  console.warn('SQLite restore failed; keeping the current browser cache.', error);
  setTimeout(() => toast('SQLite restore failed. The current browser cache was kept.'), 0);
});

// Saving. A failed save is reported once instead of losing work silently.
let storageWarned = false;
let sqliteSaveTimer = 0;
let sqliteSavePromise = Promise.resolve();
let sqliteSaveWarned = false;
let sqliteConflictWarned = false;
let sqliteReadyForWrites = false;
let sqliteWritePending = false;
function enableSqliteWrites() {
  sqliteReadyForWrites = true;
  if (!sqliteWritePending) return;
  sqliteWritePending = false;
  queueSqliteSave();
}
function reportSqliteConflicts(conflicts = []) {
  if (!conflicts.length) return;
  console.warn('SQLite concurrent changes used last-writer-wins for:', conflicts);
  if (sqliteConflictWarned) return;
  sqliteConflictWarned = true;
  const names = conflicts.slice(0, 2).map(key => key.replace(/^sqlviz\./, '')).join(', ');
  toast(`Another tab changed ${names}. The latest change was saved.`);
}
function saveSqliteNow() {
  sqliteSavePromise = sqliteSavePromise.then(async () => {
    const storage = await window.sqliteStorageReady;
    if (!storage) return;
    const dirtyToken = localStorage.getItem(SQLITE_DIRTY_KEY);
    reportSqliteConflicts(await storage.save(storage.localSnapshot()));
    if (dirtyToken && localStorage.getItem(SQLITE_DIRTY_KEY) === dirtyToken)
      localStorage.removeItem(SQLITE_DIRTY_KEY);
  }).catch(error => {
    console.warn('Could not save SQLite database.', error);
    if (!sqliteSaveWarned) {
      sqliteSaveWarned = true;
      toast('Could not save to SQLite. Your local browser copy is still available.');
    }
  });
  return sqliteSavePromise;
}
function queueSqliteSave() {
  clearTimeout(sqliteSaveTimer);
  sqliteSaveTimer = setTimeout(() => { sqliteSaveTimer = 0; saveSqliteNow(); }, 350);
}
function flushSqliteSave() {
  clearTimeout(sqliteSaveTimer);
  sqliteSaveTimer = 0;
  return saveSqliteNow();
}
function persist(key, value) {
  if (key === 'docs') syncDocs();
  if (store.set(key, value)) {
    if (key === 'docs') persistedDocs = structuredClone(docs);
    if (!sqliteReadyForWrites) {
      sqliteWritePending = true;
      persistenceDebug('sqlite:write-deferred', { key });
      return;
    }
    try { localStorage.setItem(SQLITE_DIRTY_KEY, `${Date.now()}-${Math.random()}`); } catch { /* SQLite remains best effort */ }
    persistenceDebug('local:persist', { key, dirty: !!localStorage.getItem(SQLITE_DIRTY_KEY) });
    queueSqliteSave();
    return;
  }
  if (storageWarned) return;
  storageWarned = true;
  toast('Could not save: the browser storage is full. Close some tabs you no longer need.');
}
function docData(id = docs.active) {
  if (id !== docs.active) return normalizeDocData({ ...DOC_DEFAULTS, pos: {}, ...store.get(docKey(id), {}) });
  const d = { pos: state.dataView ? schemaPos : pos,
  dataPos: state.dataView ? pos : dataPos,
    dataLayoutVersion: DATA_LAYOUT_VERSION,
    dataLayoutSchemaFingerprint: positionFingerprint(schemaPos),
    dataLayoutUserEdited,
    savedPos,
    // Keep the old field for compatibility, but persist pan/zoom per view.
    view: viewSnapshot(),
    schemaViewport: state.dataView ? schemaViewState : viewSnapshot(),
    dataViewport: state.dataView ? viewSnapshot() : dataViewState };
  for (const k of Object.keys(DOC_DEFAULTS)) d[k] = state[k];
  return normalizeDocData(d);
}
function saveDoc() {
  if (state.dataView) dataPos = positionSnapshot(pos);
  else schemaPos = positionSnapshot(pos);
  persistenceDebug('saveDoc', { dataView: state.dataView, dataLayoutVersion: DATA_LAYOUT_VERSION,
    schemaPositions: Object.keys(schemaPos).length, dataPositions: Object.keys(dataPos || {}).length,
    active: docs.active,
    sample: { Record: dataPos?.Record, Edition: dataPos?.Edition, Song: dataPos?.Song } });
  persist(docKey(docs.active), docData());
}
let saveTimer = 0;
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  persist('settings', Object.fromEntries(SETTINGS.map(k => [k, state[k]])));
  saveDoc();
}
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
function parseCurrent() {
  const r = state.mode === 'text' ? parseText(ta.value) : parseSQL(ta.value);
  r.problems.push(...resolve(r.tables, state.implicit));
  return r;
}

function update() {
  const r = parseCurrent();
  model = r;
  decorateEditor(r.problems, r);
  drawDiagram();
}

// Bring the text (or SQL) up to date after the other side was edited.
// Recorded as a silent history entry: later edits are stored as offsets into the new text.
function regenerate(which) {
  if (which === 'sql' ? !state.sqlStale : !state.textStale) return;
  histBegin('regenerate', { silent: true });
  if (which === 'sql') {
    const source = state.text.trim() ? state.text : state.sql;
    const r = parseText(source);
    resolve(r.tables);
    state.sql = sqlWithData(r.tables);
    state.sqlStale = false;
    state.textStale = false;
  } else {
    state.text = sqlToText(state.sql);
    state.textStale = false;
  }
  histCommit();
}

function sqlWithData(tables) {
  const schema = genSQL(tables);
  const data = dataInserts(tables);
  return data ? `${schema}\n${data}` : schema;
}

function setMode(mode) {
  if (mode === state.mode) return;
  histBegin('mode', { silent: true });
  regenerate(mode);
  state.mode = mode;
  loadEditor();
  updateIdentifierHint();
  histCommit();
  saveState();
}

function loadEditor() {
  const sqlContainsSimpleSyntax = /(^|\n)\s*@data\s*$/im.test(state.sql) || /^\s*#.*(?:\r?\n)\s+\S+/m.test(state.sql);
  if (state.mode === 'sql' && (!state.sql.trim() || state.sql.trim() === state.text.trim() || sqlContainsSimpleSyntax)) {
    if (!state.text.trim() && sqlContainsSimpleSyntax) state.text = state.sql;
    state.sqlStale = true;
  }
  regenerate(state.mode);
  ta.value = state.mode === 'text' ? state.text : state.sql;
  ta.scrollTop = 0;
  updateModeSeg();
  update();
}

$('#modeSeg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  setHelp(false); // back from the syntax reference, into the chosen view
  setMode(b.dataset.mode);
});

// ─── Theme ───────────────────────────────────────────────────────────────────
// Follows the system until the user clicks the toggle. Toggling back to what the
// system says drops the override, so the page follows the system again.

const systemDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => (document.documentElement.dataset.theme ?? (systemDark.matches ? 'dark' : 'light')) === 'dark';

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  $('#themeBtn').title = isDark() ? 'Switch to light mode' : 'Switch to dark mode';
  applyPalette(); // each theme has a light and a dark variant
}
applyTheme(store.get('theme', 'auto'));
systemDark.addEventListener('change', () => applyTheme(store.get('theme', 'auto')));
$('#themeBtn').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  const theme = next === (systemDark.matches ? 'dark' : 'light') ? 'auto' : next;
  store.set('theme', theme);
  applyTheme(theme);
});

// ─── Toast, examples, help, export menu, splitter ────────────────────────────

let toastTimer = 0;
function toast(msg, actLabel, act) {
  $('#toastMsg').textContent = msg;
  const b = $('#toastAct');
  b.hidden = !act;
  b.textContent = actLabel || '';
  b.onclick = () => { act(); $('#toast').hidden = true; };
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}

// The examples are listed in the empty diagram's message
$('#emptyState .examples').addEventListener('click', e => {
  const b = e.target.closest('button[data-example]');
  // an example opens in a new tab (with a fresh auto layout), so no work is overwritten
  if (b) newDoc(b.textContent, EXAMPLES[b.dataset.example]);
});

// The syntax reference is a third view of the editor area, beside Simple and SQL:
// while it's open neither of those is highlighted, and choosing one closes it.
function setHelp(open) {
  $('#help').hidden = !open;
  $('#helpBtn').classList.toggle('on', open);
  $('#helpBtn').setAttribute('aria-pressed', open);
  updateModeSeg();
}
function updateModeSeg() {
  const helpOpen = !$('#help').hidden;
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', !helpOpen && b.dataset.mode === state.mode));
}
$('#helpBtn').onclick = () => setHelp($('#help').hidden);
$('#helpClose').onclick = () => setHelp(false);

// Relationship notation. Going from arrows to an ER-style notation first shows why it
// doesn't fit SQL tables; nothing changes until "Switch to …" is chosen.
let pendingNotation = null;
function applyNotation() {
  if (!NOTATIONS[state.notation]) state.notation = 'arrows';
  const b = $('#notationBtn');
  $('#notationIco').innerHTML = notationIcon(state.notation);
  b.classList.toggle('er', state.notation !== 'arrows');
  b.title = state.notation === 'arrows' ? 'Relationship notation: Arrows (SQL)' : `Relationship notation: ${NOTATIONS[state.notation]} (an ER-style notation: see why arrows fit SQL tables better)`;
  $('#notationList').innerHTML = Object.entries(NOTATIONS).map(([key, name]) =>
    `<button role="menuitemradio" aria-checked="${key === state.notation}" data-notation="${key}">` +
    `<span class="check">${key === state.notation ? '✓' : ''}</span>${notationIcon(key)}<span class="item-name">${name}</span></button>`).join('');
  if (model.tables?.length) drawDiagram();
}
function closeNote() {
  pendingNotation = null;
  $('#notationNote').hidden = true;
}
function setNotation(n) {
  state.notation = n;
  applyNotation();
  saveState();
}
$('#notationList').addEventListener('click', e => {
  const n = e.target.closest('[data-notation]')?.dataset.notation;
  if (!n) return;
  closeMenus();
  if (state.notation === 'arrows' && n !== 'arrows') {
    // stay on arrows until the user confirms; the same note for every ER-style notation
    pendingNotation = n;
    $('#noteSwitch').textContent = `Switch to ${NOTATIONS[n]}`;
    $('#notationNote').hidden = false;
    $('#noteStay').focus();
  } else {
    closeNote();
    setNotation(n);
  }
});
$('#noteSwitch').onclick = () => { const n = pendingNotation; closeNote(); if (n) setNotation(n); };
$('#noteStay').onclick = closeNote;
$('#notationNote').addEventListener('keydown', e => { if (e.key === 'Escape') closeNote(); });
applyNotation();

// Implicit arrows: XxxId columns without "->" point to table Xxx (diagram only)
function applyImplicit() {
  const b = $('#implicitBtn');
  b.classList.toggle('on', state.implicit);
  b.setAttribute('aria-pressed', String(state.implicit));
}
$('#implicitBtn').onclick = () => {
  state.implicit = !state.implicit;
  applyImplicit();
  update();
  saveState();
};
applyImplicit();

// Keys only: boxes show just the key columns, so the joins in a big schema stand out
function applyKeysOnly() {
  const b = $('#keysBtn');
  b.classList.toggle('on', state.keysOnly);
  b.setAttribute('aria-pressed', String(state.keysOnly));
}
$('#keysBtn').onclick = () => {
  state.keysOnly = !state.keysOnly;
  applyKeysOnly();
  drawDiagram();
  if (boxesOverlap()) autoLayout(); // boxes placed while short may collide once they grow
  saveState();
};
applyKeysOnly();

// Data view: sample rows in every box, and an arrow from each foreign key value to its row.
// Schema and data views keep independent positions, so toggling does not discard manual moves.
function applyDataView() {
  const b = $('#dataBtn');
  b.classList.toggle('on', state.dataView);
  b.setAttribute('aria-pressed', String(state.dataView));
}
$('#dataBtn').onclick = async () => {
  // Store the viewport before changing mode. Positions and viewport are both
  // mode-specific; toggling must not call fit() for an already-known view.
  if (state.dataView) dataViewState = viewSnapshot();
  else schemaViewState = viewSnapshot();
  state.dataView = !state.dataView;
  applyDataView();
  let laidOut = false;
  if (state.dataView) {
    schemaPos = positionSnapshot(pos);
    if (dataPos) pos = structuredClone(dataPos);
    else { dataPos = null; dataLayoutUserEdited = false; pos = {}; laidOut = true; }
  } else {
    dataPos = positionSnapshot(pos);
    pos = structuredClone(schemaPos);
  }
  drawDiagram();
  // A toggle must not reinterpret a user's manual positions as an error.
  // Only the first data-view layout is generated automatically.
  if (laidOut) {
    // Use the same measured card widths on first creation and after reload.
    // Otherwise fallback-font metrics can produce a different column packing.
    await fontsLoaded;
    autoLayout();
    // This is the automatic first data layout, not a manual user edit.
    dataLayoutUserEdited = false;
    fit();
    dataViewState = viewSnapshot();
  } else {
    const restored = restoreViewSnapshot(state.dataView ? dataViewState : schemaViewState);
    if (!restored) {
      fit();
      if (state.dataView) dataViewState = viewSnapshot();
      else schemaViewState = viewSnapshot();
    }
  }
  // A view toggle changes the complete layout snapshot. Persist it immediately
  // so an immediate browser reload cannot restore the previous data layout.
  saveNow();
  await flushSqliteSave();
  writeImmutableLayout();
};
applyDataView();

// Menus: Export (app bar) and Text colours (editor header)
const MENUS = [];
function closeMenus() {
  for (const [btn, menu] of MENUS) {
    if ($(menu).contains(document.activeElement)) $(btn).focus(); // e.g. an item picked with Enter
    $(menu).hidden = true;
    $(btn).setAttribute('aria-expanded', 'false');
  }
}
const menuItems = menu => [...$(menu).querySelectorAll('button:not(:disabled)')];
function openMenu(btn, menu, focus = null) {
  closeMenus();
  $(menu).hidden = false;
  $(btn).setAttribute('aria-expanded', 'true');
  const items = menuItems(menu);
  if (focus === 'first') (items.find(b => b.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
  if (focus === 'last') items.at(-1)?.focus();
}
// Keyboard: ↓/↑ on the button opens the menu, then ↓ ↑ Home End move through it,
// Esc closes it (back to the button) and Tab leaves it
function registerMenu(btn, menu) {
  MENUS.push([btn, menu]);
  $(btn).onclick = e => {
    e.stopPropagation();
    if ($(menu).hidden) openMenu(btn, menu, e.detail === 0 ? 'first' : null); // detail 0: Enter or Space
    else closeMenus();
  };
  $(btn).addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    openMenu(btn, menu, e.key === 'ArrowDown' ? 'first' : 'last');
  });
  $(menu).addEventListener('keydown', e => {
    const items = menuItems(menu), i = items.indexOf(document.activeElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (to !== undefined) {
      e.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      closeMenus();
    } else if (e.key === 'Tab') {
      $(menu).hidden = true;
      $(btn).setAttribute('aria-expanded', 'false');
    }
  });
}
// Editor text size (the Text menu stays open while stepping, so you see the change)
for (const [btn, menu] of [['#exportBtn', '#exportMenu'], ['#schemeBtn', '#schemeMenu'], ['#themeMenuBtn', '#themeMenu'], ['#notationBtn', '#notationMenu']]) registerMenu(btn, menu);
const FONT_MIN = 10, FONT_MAX = 24;
const lineHeight = () => Math.round(state.fontSize * 1.54); // 13px → 20px, as in the design
function applyFontSize() {
  state.fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(+state.fontSize || 13)));
  document.documentElement.style.setProperty('--code-size', state.fontSize + 'px');
  document.documentElement.style.setProperty('--code-lh', lineHeight() + 'px');
  $('#sizeLabel').textContent = state.fontSize + 'px';
  $('#sizeDown').disabled = state.fontSize <= FONT_MIN;
  $('#sizeUp').disabled = state.fontSize >= FONT_MAX;
  if (state.wrap) redecorate(); // wrapped lines change height
  syncScroll();
}

// Word wrap (on by default). The text box and the colouring layer wrap identically;
// the line numbers follow the measured height of each line.
function applyWrap() {
  $('.code').classList.toggle('wrap', state.wrap);
  ta.wrap = state.wrap ? 'soft' : 'off';
  $('#wrapSwitch').setAttribute('aria-checked', String(state.wrap));
  redecorate();
}
$('#wrapSwitch').onclick = e => { e.stopPropagation(); state.wrap = !state.wrap; applyWrap(); saveState(); };
// re-measure wrapped lines when the editor's width changes (splitter, ½ screen, window)
let wrapWidth = 0;
new ResizeObserver(() => {
  if (!state.wrap || ta.clientWidth === wrapWidth) return;
  wrapWidth = ta.clientWidth;
  redecorate();
}).observe(ta);
const stepFontSize = d => { state.fontSize += d; applyFontSize(); saveState(); };
$('#sizeDown').onclick = e => { e.stopPropagation(); stepFontSize(-1); };
$('#sizeUp').onclick = e => { e.stopPropagation(); stepFontSize(1); };
applyFontSize();
applyWrap();

document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu-wrap')) closeMenus(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });

// The schema as MariaDB: the SQL as edited, or generated from the text
function currentSql() {
  if (!state.sqlStale) return state.sql;
  const r = parseText(state.text);
  resolve(r.tables);
  return sqlWithData(r.tables);
}
async function copySql() {
  closeMenus();
  try {
    await navigator.clipboard.writeText(currentSql());
    toast('SQL copied to clipboard');
  } catch {
    toast('Could not copy. Use Export → MariaDB script instead.');
  }
}
$('#svgBtn').onclick = () => { closeMenus(); exportSvg(); };
$('#pngBtn').onclick = () => { closeMenus(); exportPng(); };
$('#copyImgBtn').onclick = () => { closeMenus(); copyImage(); };
$('#sqlBtn').onclick = () => {
  closeMenus();
  const name = exportName('sql');
  download(new Blob([currentSql()], { type: 'text/sql' }), name);
  toast(`Saved ${name}`);
};
$('#sqlDataBtn').onclick = () => {
  closeMenus();
  const name = exportName('sql');
  download(new Blob([currentSql()], { type: 'text/sql' }), name);
  toast(`Saved ${name} with data`);
};
$('#copySqlBtn').onclick = copySql;
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copySql(); }
});

// Editor width: collapsed, mid (420px or the width last dragged to) or half the screen.
// Splitter between editor and canvas (editor ≥ 300px, canvas ≥ 380px).
const left = $('#left'), split = $('#split');
const clampLeft = w => Math.max(300, Math.min(window.innerWidth - 380, w));

function applyPanel(keepView = true) {
  if (!['collapsed', 'mid', 'half'].includes(state.panel)) state.panel = 'mid';
  const before = svg.getBoundingClientRect().width, wasVisible = diagramVisible();
  document.body.classList.toggle('panel-collapsed', state.panel === 'collapsed');
  if (state.panel !== 'collapsed') {
    left.style.width = clampLeft(state.panel === 'half' ? window.innerWidth / 2 : state.leftW || 420) + 'px';
  }
  document.querySelectorAll('#panelSeg button').forEach(b => b.classList.toggle('on', b.dataset.panel === state.panel));
  // keep what was in the middle of the canvas in the middle; if the whole diagram
  // was on screen and no longer fits, fit it again
  const after = svg.getBoundingClientRect().width;
  if (keepView && after !== before) {
    view.tx += (after - before) / 2;
    applyView();
    if (wasVisible && !diagramVisible()) fit();
  }
}
$('#panelSeg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  state.panel = b.dataset.panel;
  applyPanel();
  saveState();
});
window.addEventListener('resize', () => { if (state.panel === 'half') applyPanel(); });
applyPanel(false);

split.addEventListener('pointerdown', e => {
  split.setPointerCapture(e.pointerId);
  split.classList.add('active');
  const move = ev => {
    state.leftW = clampLeft(ev.clientX);
    if (state.panel !== 'mid') { state.panel = 'mid'; applyPanel(false); } // dragging makes it a custom "mid" width
    left.style.width = state.leftW + 'px';
  };
  const up = () => {
    split.classList.remove('active');
    split.removeEventListener('pointermove', move);
    split.removeEventListener('pointerup', up);
    saveState();
  };
  split.addEventListener('pointermove', move);
  split.addEventListener('pointerup', up);
});

// Presentation mode: hide everything but the diagram, go full screen and zoom it up.
// Leaving (the button, or Esc, which also ends full screen) puts the view back.
let presentView = null;
function setPresenting(on) {
  if (on === !!presentView) return;
  document.body.classList.toggle('presenting', on);
  $('#presentBtn').classList.toggle('on', on);
  $('#presentBtn span').textContent = on ? 'Exit' : 'Present';
  if (on) {
    presentView = { ...view };
    document.documentElement.requestFullscreen?.().catch(() => {});
    requestAnimationFrame(() => fit(2));
  } else {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    Object.assign(view, presentView);
    presentView = null;
    applyView();
  }
}
$('#presentBtn').onclick = () => setPresenting(!presentView);
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) setPresenting(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && presentView) setPresenting(false); });
window.addEventListener('resize', () => { if (presentView) fit(2); });

// Shortcuts are written the Mac way in the page; elsewhere they say Ctrl and Shift
if (!/mac|iphone|ipad/i.test(navigator.userAgentData?.platform ?? navigator.platform)) {
  const pc = s => s.replace('⇧⌘Z', 'Ctrl+Y').replace('⌘⇧', 'Ctrl+Shift+').replace('⌘Z', 'Ctrl+Z')
    .replace(/⇧/g, 'Shift').replace(/⌘/g, 'Ctrl');
  for (const el of document.querySelectorAll('[title*="⌘"]')) el.title = pc(el.title);
  for (const el of document.querySelectorAll('.menu .ext, .help-keys span')) {
    if (/[⌘⇧]/.test(el.textContent)) el.textContent = pc(el.textContent);
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────
// Box widths are measured with the Geist fonts, so wait for them (at most 1.5s).

// A font that fails to download (blocked remote fonts) counts as loaded: the fallback is measured.
const fontsLoaded = Promise.all(Object.values(FONTS).map(f => document.fonts.load(f))).catch(() => {});
Promise.race([fontsLoaded, new Promise(r => setTimeout(r, 1500))]).then(() => {
  widthCache.clear();
  loadEditor();
  sanitizePositionsForModel();
  // Apply after parsing as well: startup measurement may otherwise use the
  // last working positions before the explicit snapshot is applied.
  applySavedLayoutDefault();
  applyDataLayoutDefault();
  // An explicit layout snapshot is authoritative. Do not replace it with the
  // automatic layout merely because cards changed size after a reload.
  if (boxesOverlap() && !Object.keys(savedPos).length) autoLayout();
  const restored = restoreViewSnapshot(state.dataView ? dataViewState : schemaViewState);
  if (!restored) {
    fit();
    if (state.dataView) dataViewState = viewSnapshot();
    else schemaViewState = viewSnapshot();
  }
  restoreStoredDataPositions();
});
// fonts that arrive late: measure again, and tidy up if the wider boxes now collide
fontsLoaded.then(() => {
  widthCache.clear();
  if (!model.tables) return;
  drawDiagram();
  if (boxesOverlap() && !Object.keys(savedPos).length) { autoLayout(); fit(); }
  applySavedLayoutDefault();
  applyDataLayoutDefault();
  restoreStoredDataPositions();
});
