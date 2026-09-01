// Parses a CSV or Excel (.xlsx/.xls) file of student names into
// { firstName, lastName } rows for bulk import in Schülerverwaltung.
// xlsx is loaded lazily (it's a large lib) so it's only fetched when
// someone actually imports a file.

const FIRST_NAME_HEADERS = ['vorname', 'first name', 'firstname', 'first_name'];
const LAST_NAME_HEADERS = ['nachname', 'last name', 'lastname', 'last_name'];
const FULL_NAME_HEADERS = ['name', 'schüler', 'schueler', 'schüler:in'];
const KLASSE_HEADERS = ['klasse', 'klasse:in', 'class'];

function normalizeHeader(cell) {
  return String(cell ?? '').trim().toLowerCase();
}

function splitFullName(full) {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

// Auto-detects comma vs. semicolon (common in German-locale Excel exports)
// from the header line, then parses with quote support.
function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { if (row.some((f) => f.trim())) rows.push(row); row = []; };

  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) pushField();
    else if (c === '\r') { /* skip, \n handles the line break */ }
    else if (c === '\n') { pushField(); pushRow(); }
    else field += c;
  }
  if (field || row.length) { pushField(); pushRow(); }
  return rows;
}

async function sheetToRows(buffer) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false });
}

function detectColumns(headerRow) {
  const idx = { first: -1, last: -1, full: -1, klasse: -1 };
  headerRow.forEach((cell, i) => {
    const h = normalizeHeader(cell);
    if (idx.first === -1 && FIRST_NAME_HEADERS.includes(h)) idx.first = i;
    if (idx.last === -1 && LAST_NAME_HEADERS.includes(h)) idx.last = i;
    if (idx.full === -1 && FULL_NAME_HEADERS.includes(h)) idx.full = i;
    if (idx.klasse === -1 && KLASSE_HEADERS.includes(h)) idx.klasse = i;
  });
  return idx;
}

function rowToStudent(row, cols) {
  let firstName = '';
  let lastName = '';
  if (cols.first !== -1 && cols.last !== -1) {
    firstName = String(row[cols.first] ?? '').trim();
    lastName = String(row[cols.last] ?? '').trim();
  } else if (cols.full !== -1) {
    ({ firstName, lastName } = splitFullName(row[cols.full]));
  } else if (row.length >= 2) {
    firstName = String(row[0] ?? '').trim();
    lastName = String(row[1] ?? '').trim();
  } else if (row.length === 1) {
    ({ firstName, lastName } = splitFullName(row[0]));
  }
  if (!firstName || !lastName) return null;
  const student = { firstName, lastName };
  // Only carry a class when the file actually has a Klasse column, so files
  // without one keep the plain { firstName, lastName } shape.
  if (cols.klasse !== -1) student.klasse = String(row[cols.klasse] ?? '').trim();
  return student;
}

// Returns [{ firstName, lastName }, ...], skipping blank/unparseable rows.
export async function parseStudentsFile(file) {
  const rows = /\.csv$/i.test(file.name) ? parseCsv(await file.text()) : await sheetToRows(await file.arrayBuffer());
  if (!rows.length) return [];

  const cols = detectColumns(rows[0]);
  const hasHeaderRow = cols.first !== -1 || cols.last !== -1 || cols.full !== -1;
  const dataRows = hasHeaderRow ? rows.slice(1) : rows;

  return dataRows.map((row) => rowToStudent(row, cols)).filter(Boolean);
}
