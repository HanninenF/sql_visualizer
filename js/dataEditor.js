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
    if (rowIndex >= 0 && rowIndex < (table.dataRows?.length ?? 0)) return { table, rowIndex };
    if (!table.dataRows?.length && rowIndex === 0) return { table, rowIndex: null };
  }
  return null;
}

function dataValueText(value) {
  if (value == null) return 'NULL';
  const s = String(value);
  return /[|#\n\r]|^\s|\s$/.test(s) ? `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : s;
}

function openDataEditor(tableName, rowIndex) {
  const table = model.tables.find(t => t.name === tableName);
  const row = rowIndex == null ? null : table?.dataRows?.[rowIndex];
  if (!table || (rowIndex != null && !row)) return;
  dataEdit = { table, rowIndex, row };
  $('#dataDlgTitle').textContent = row ? `Edit ${table.name} data` : `Add data to ${table.name}`;
  dataFields.innerHTML = table.cols.map((c, i) =>
    `<label class="field data-field"><span>${esc(c.name)}</span>` +
    `<input type="text" data-col="${i}" value="${esc(row?.values[i] ?? '')}" autocomplete="off" spellcheck="false"></label>`
  ).join('');
  dataError.textContent = '';
  dataDlg.hidden = false;
  dataFields.querySelector('input')?.focus();
}

function closeDataEditor() {
  dataDlg.hidden = true;
  dataEdit = null;
}

function saveDataEditor() {
  if (!dataEdit) return;
  const inputs = [...dataFields.querySelectorAll('input[data-col]')];
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
