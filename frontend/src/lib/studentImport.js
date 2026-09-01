// Parses a CSV/TSV/TXT or spreadsheet (XLSX/XLS/ODS) file of student names into
// { firstName, lastName, klasse? } rows for bulk import in Schülerverwaltung.
// It aims to accept the many shapes such a file arrives in — with or without a
// header row, comma/semicolon/tab/pipe separated, names split across two
// columns or combined as "First Last" or "Last, First". The human-readable
// summary shown next to the import button lives in SUPPORTED_IMPORT_FORMATS
// (exported below) so the docs and the parser can't drift apart.
// xlsx is loaded lazily (it's a large lib) so it's only fetched for spreadsheets.

const FIRST_NAME_HEADERS = [
  'vorname', 'vornamen', 'first name', 'firstname', 'first_name', 'first',
  'given name', 'givenname', 'rufname',
];
const LAST_NAME_HEADERS = [
  'nachname', 'last name', 'lastname', 'last_name', 'last',
  'familienname', 'family name', 'familyname', 'surname',
];
const FULL_NAME_HEADERS = [
  'name', 'names', 'schüler', 'schueler', 'schüler:in', 'schülerin', 'schuelerin',
  'schülername', 'schuelername', 'vollständiger name', 'voller name',
  'vor- und nachname', 'vorname nachname', 'student', 'sus',
];
const KLASSE_HEADERS = [
  'klasse', 'klasse:in', 'klassen', 'klassenname', 'class', 'lerngruppe', 'gruppe',
];

// Rendered in the UI next to the import button (see Schuelerverwaltung).
export const SUPPORTED_IMPORT_FORMATS = {
  fileTypes: 'CSV, Excel (XLSX/XLS/ODS), TSV/TXT',
  separators: 'Komma, Semikolon, Tabulator oder senkrechter Strich (automatisch erkannt)',
  withHeader: [
    'Getrennte Spalten: „Vorname“ und „Nachname“ (Reihenfolge egal)',
    'Oder eine kombinierte Spalte „Name“ (z. B. „Max Mustermann“ oder „Mustermann, Max“)',
    'Optionale Spalte „Klasse“ (auch „Lerngruppe“) wird mit übernommen',
    'Groß-/Kleinschreibung, Anführungszeichen und : / . am Spaltennamen egal',
  ],
  withoutHeader: [
    '1 Spalte → kompletter Name („Max Mustermann“ oder „Mustermann, Max“)',
    '2 Spalten → Vorname, Nachname (in dieser Reihenfolge)',
    '3 Spalten → Vorname, Nachname, Klasse',
  ],
  notes: [
    'Leere Zeilen und Zeilen ohne Vor- und Nachname werden übersprungen',
    'Bereits vorhandene Namen sind in der Vorschau vorab abgewählt',
  ],
};

function normalizeHeader(cell) {
  // Lowercase, and strip surrounding whitespace/quotes/colons/dots so
  // "Vorname:", ' "Nachname" ' and "KLASSE" all match.
  return String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[\s"':.]+|[\s"':.]+$/g, '');
}

// Splits a single combined name field. Handles both "First [Middle] Last" and
// the "Last, First" form (comma present) common in exported lists.
function splitFullName(full) {
  const raw = String(full ?? '').trim();
  if (!raw) return { firstName: '', lastName: '' };
  if (raw.includes(',')) {
    const [last, ...rest] = raw.split(',');
    return { firstName: rest.join(',').trim(), lastName: last.trim() };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

// Picks the separator that appears most on the header line. Semicolon (German
// Excel) and tab (copy-paste from a sheet) are as common as comma. Returns ''
// when the line has no separator at all: the file is then a single column and
// must NOT be split, so a "Last, First" value keeps its comma intact.
function detectDelimiter(firstLine) {
  const candidates = [';', '\t', ',', '|'];
  let best = '';
  let bestCount = 0;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

// Auto-detects the delimiter from the header line, then parses with quote support.
function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const delimiter = detectDelimiter(firstLine);

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
    else if (delimiter && c === delimiter) pushField();
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
  // Use the first sheet that actually has data, not blindly the first tab.
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false });
    if (rows.length) return rows;
  }
  return [];
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
  // Carry a class when the file has a named Klasse column, or — in a headerless
  // file — from a third positional column (Vorname, Nachname, Klasse).
  let klasse;
  if (cols.klasse !== -1) klasse = String(row[cols.klasse] ?? '').trim();
  else if (cols.first === -1 && cols.last === -1 && cols.full === -1 && row.length >= 3) {
    klasse = String(row[2] ?? '').trim();
  }
  if (klasse !== undefined) student.klasse = klasse;
  return student;
}

// Returns [{ firstName, lastName, klasse? }, ...], skipping blank/unparseable rows.
export async function parseStudentsFile(file) {
  const isSpreadsheet = /\.(xlsx|xlsm|xls|ods)$/i.test(file.name);
  const rows = isSpreadsheet ? await sheetToRows(await file.arrayBuffer()) : parseCsv(await file.text());
  if (!rows.length) return [];

  const cols = detectColumns(rows[0]);
  const hasHeaderRow = cols.first !== -1 || cols.last !== -1 || cols.full !== -1 || cols.klasse !== -1;
  const dataRows = hasHeaderRow ? rows.slice(1) : rows;
  // In a headerless file the column layout is inferred per row, not from row 0.
  const dataCols = hasHeaderRow ? cols : { first: -1, last: -1, full: -1, klasse: -1 };

  return dataRows.map((row) => rowToStudent(row, dataCols)).filter(Boolean);
}
