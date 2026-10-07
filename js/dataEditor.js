'use strict';

// ─── Data row editor ─────────────────────────────────────────────────────────
// Data rows remain part of the text syntax, so editing a row here rewrites only
// that @data line and keeps the text editor as the single source of truth.

const dataDlg = $('#dataDlg');
const dataFields = $('#dataFields');
const dataError = $('#dataError');
let dataEdit = null;

function dataRowAtPoint(e) {
  const p = toWorld(e);
  for (const [table, box] of geometry.boxes) {
    if (!box.data || p.x < box.x || p.x > box.x + box.w || p.y < box.y || p.y > box.y + box.h) continue;
    const localY = p.y - box.y;
    const firstRow = HEAD_H + 6 + COLHEAD_H;
    const rowIndex = Math.floor((localY - firstRow) / DATA_H);
    if (rowIndex === 0) return { table, rowIndex: null };
    const dataIndex = rowIndex - 1;
    if (dataIndex >= 0 && dataIndex < (table.dataRows?.length ?? 0)) return { table, rowIndex: dataIndex };
  }
  return null;
}

function dataValueText(value) {
  if (value == null) return 'NULL';
  const s = String(value);
  return /[|#\n\r]|^\s|\s$/.test(s) ? `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : s;
}

function referenceValues(c) {
  return referenceOptions(c).map(option => option.value);
}

function referenceOptions(c) {
  const target = c.target ?? model.tables.find(t => t.name.toLowerCase() === c.ref?.toLowerCase());
  const targetCol = c.targetCol ?? target?.pkCols?.[0];
  if (!target || !targetCol) return [];
  const nameCol = target.cols.find(col => /^(name|namn)$/i.test(col.name));
  return [...new Map((sampleData(model.tables).get(target) ?? [])
    .map(row => {
      const value = row.values.get(targetCol);
      const name = nameCol ? row.values.get(nameCol) : null;
      return value == null ? null : [String(value), { value: String(value), name: name == null ? '' : String(name) }];
    })
    .filter(Boolean)).values()];
}

function generatedValue(table, c, refs, index, currentValues = []) {
  if (refs.length) return refs[0];
  if (/e.?mail|epost/i.test(c.name)) {
    const nameParts = table.cols
      .map((col, i) => ({ col, value: currentValues[i] ?? '' }))
      .filter(({ col, value }) => value && /name|namn|first|for|last|sur|efter/i.test(col.name))
      .map(({ value }) => value.trim())
      .join(' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
    if (nameParts) return `${nameParts}@example.com`;
  }
  try {
    const swedish = SWEDISH.test(low(table.name + ' ' + table.cols.map(col => col.name).join(' ')));
    const person = {
      first: nth(W.first[swedish ? 1 : 0], `${table.name}#f`, index),
      last: nth(W.last[swedish ? 1 : 0], `${table.name}#l`, index),
    };
    const value = sampleValue(table, c, index, swedish, person);
    if (value != null && value !== '') return String(value);
  } catch { /* fall back to a small safe example below */ }
  const name = c.name.toLowerCase();
  const type = (c.effType ?? c.type ?? '').toLowerCase();
  if (c.isPk && /int|serial/.test(type)) return '1';
  if (/date/.test(type)) return '2025-01-01';
  if (/bool/.test(type)) return '1';
  if (/email|e.?post/.test(name)) return 'fredrik@example.com';
  if (/name|namn/.test(name)) return 'Fredrik';
  if (/grade|betyg/.test(name)) return 'A';
  if (/int|decimal|numeric|float|double/.test(type)) return '1';
  return `${table.name} 1`;
}

function syncGeneratedEmails() {
  if (!dataEdit) return;
  const fields = [...dataFields.querySelectorAll('input[data-col], select[data-col]')];
  const currentValues = fields.map(field => field.value);
  dataEdit.table.cols.forEach((c, i) => {
    if (!/e.?mail|epost/i.test(c.name)) return;
    const control = fields[i];
    if (!control || (control.value && !/@example\.com$/i.test(control.value))) return;
    control.value = generatedValue(dataEdit.table, c, referenceValues(c), dataEdit.exampleIndex ?? 0, currentValues);
  });
}

function openDataEditor(tableName, rowIndex) {
  const table = model.tables.find(t => t.name === tableName);
  const row = rowIndex == null ? null : table?.dataRows?.[rowIndex];
  if (!table || (rowIndex != null && !row)) return;
  dataEdit = { table, rowIndex, row };
  $('#dataDlgTitle').textContent = row ? `Edit ${table.name} data` : `Add data to ${table.name}`;
  dataFields.innerHTML = table.cols.map((c, i) => {
    const value = row?.values[i] ?? '';
    const options = referenceOptions(c);
    const refs = options.map(option => option.value);
    const isReference = !!c.ref || !!c.target;
    const control = isReference
      ? `<select class="data-ref" data-col="${i}"><option value="">NULL</option>${options.length ? options.map(option =>
          `<option value="${esc(option.value)}"${String(value) === option.value ? ' selected' : ''}>${esc(option.value)}${option.name ? ` — ${esc(option.name)}` : ''}</option>`).join('')
        : `<option disabled>No available values</option>`}</select>`
      : `<input type="text" data-col="${i}" value="${esc(value)}" autocomplete="off" spellcheck="false">`;
    return `<label class="field data-field"><span>${esc(c.name)}</span>${control}` +
      `<button type="button" class="data-generate" data-col="${i}" title="Generate example">↻</button></label>`;
  }).join('');
  dataError.textContent = '';
  dataDlg.hidden = false;
  dataFields.querySelector('input, select')?.focus();
}

function closeDataEditor() {
  dataDlg.hidden = true;
  dataEdit = null;
}

function saveDataEditor() {
  if (!dataEdit) return;
  const inputs = [...dataFields.querySelectorAll('input[data-col], select[data-col]')];
  const values = inputs.map(input => input.value.trim() === '' ? null : input.value);
  const lines = state.text.split('\n');
  const lineIndex = dataEdit.row ? dataEdit.row.line - 1 : -1;
  if (dataEdit.row && (lineIndex < 0 || lineIndex >= lines.length)) return closeDataEditor();
  const indent = dataEdit.row ? lines[lineIndex].match(/^\s*/)?.[0] ?? '    ' : '    ';
  histBegin('edit data');
  if (dataEdit.row) {
    const next = `${indent}${values.map(dataValueText).join(' | ')}`;
    if (lines[lineIndex] === next) { histCommit(); return closeDataEditor(); }
    lines[lineIndex] = next;
  } else {
    const tableStart = dataEdit.table.line - 1;
    let tableEnd = lines.length;
    for (let i = tableStart + 1; i < lines.length; i++) {
      if (lines[i].trim() && !/^\s/.test(lines[i])) { tableEnd = i; break; }
    }
    let dataLine = -1;
    for (let i = tableStart + 1; i < tableEnd; i++) {
      if (/^\s*@data\s*$/i.test(lines[i])) { dataLine = i; break; }
    }
    const rowText = `    ${values.map(dataValueText).join(' | ')}`;
    if (dataLine < 0) lines.splice(tableEnd, 0, '  @data', rowText);
    else lines.splice(dataLine + 1, 0, rowText);
  }
  state.text = lines.join('\n');
  ta.value = state.text;
  state.textStale = true;
  update();
  histCommit();
  saveState();
  closeDataEditor();
}

dataFields.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); saveDataEditor(); }
  if (e.key === 'Escape') { e.preventDefault(); closeDataEditor(); }
});
dataFields.addEventListener('click', e => {
  const button = e.target.closest('.data-generate');
  if (!button || !dataEdit) return;
  const i = +button.dataset.col, c = dataEdit.table.cols[i], refs = referenceValues(c);
  const control = dataFields.querySelector(`[data-col="${i}"]`);
  const currentValues = [...dataFields.querySelectorAll('input[data-col], select[data-col]')].map(field => field.value);
  dataEdit.exampleIndex = (dataEdit.exampleIndex ?? 0) + 1;
  control.value = generatedValue(dataEdit.table, c, refs, dataEdit.exampleIndex, currentValues);
  syncGeneratedEmails();
});
dataFields.addEventListener('input', e => {
  const col = dataEdit?.table.cols[+e.target.dataset.col];
  if (col && /name|namn|first|for|last|sur|efter/i.test(col.name)) syncGeneratedEmails();
});
$('#dataCancel').onclick = closeDataEditor;
$('#dataSave').onclick = saveDataEditor;
dataDlg.addEventListener('click', e => { if (e.target === dataDlg) closeDataEditor(); });

svg.addEventListener('click', e => {
  const hit = dataRowAtPoint(e);
  if (!hit || hit.rowIndex != null) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  openDataEditor(hit.table.name, null);
});

svg.addEventListener('dblclick', e => {
  const hit = dataRowAtPoint(e);
  if (!hit) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  openDataEditor(hit.table.name, hit.rowIndex);
});
