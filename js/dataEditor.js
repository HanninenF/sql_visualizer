'use strict';

// ─── Data row editor ─────────────────────────────────────────────────────────
// Data rows remain part of the text syntax, so editing a row here rewrites only
// that @data line and keeps the text editor as the single source of truth.

const dataDlg = $('#dataDlg');
const dataFields = $('#dataFields');
const dataError = $('#dataError');
let dataEdit = null;

function dataValueText(value) {
  if (value == null) return 'NULL';
  const s = String(value);
  return /[|#\n\r]|^\s|\s$/.test(s) ? `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : s;
}

function openDataEditor(tableName, rowIndex) {
  const table = model.tables.find(t => t.name === tableName);
  const row = table?.dataRows?.[rowIndex];
  if (!table || !row) return;
  dataEdit = { table, rowIndex, row };
  $('#dataDlgTitle').textContent = `Edit ${table.name} data`;
  dataFields.innerHTML = table.cols.map((c, i) =>
    `<label class="field data-field"><span>${esc(c.name)}</span>` +
    `<input type="text" data-col="${i}" value="${esc(row.values[i] ?? '')}" autocomplete="off" spellcheck="false"></label>`
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
  const lineIndex = dataEdit.row.line - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) return closeDataEditor();
  const indent = lines[lineIndex].match(/^\s*/)?.[0] ?? '    ';
  const next = `${indent}${values.map(dataValueText).join(' | ')}`;
  if (lines[lineIndex] === next) return closeDataEditor();
  histBegin('edit data');
  lines[lineIndex] = next;
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

svg.addEventListener('dblclick', e => {
  const row = e.target.closest('.drow'), table = e.target.closest('.tbl');
  if (!row || !table) return;
  e.preventDefault();
  openDataEditor(table.dataset.t, +row.dataset.row);
});
