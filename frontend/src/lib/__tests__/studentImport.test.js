import { describe, expect, test } from 'vitest';
import { parseStudentsFile } from '../studentImport.js';

// jsdom's built-in File polyfill doesn't implement .text()/.arrayBuffer(),
// so we duck-type the minimal shape parseStudentsFile actually reads.
function csvFile(text, name = 'schueler.csv') {
  return { name, text: async () => text };
}

describe('parseStudentsFile (CSV)', () => {
  test('parses Vorname/Nachname headers with comma delimiter', async () => {
    const rows = await parseStudentsFile(csvFile('Vorname,Nachname\nMax,Mustermann\nAnna,Beispiel'));
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann' },
      { firstName: 'Anna', lastName: 'Beispiel' },
    ]);
  });

  test('auto-detects semicolon delimiter (German Excel export)', async () => {
    const rows = await parseStudentsFile(csvFile('Vorname;Nachname\nMax;Mustermann\nAnna;Beispiel'));
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann' },
      { firstName: 'Anna', lastName: 'Beispiel' },
    ]);
  });

  test('handles quoted fields containing the delimiter', async () => {
    const rows = await parseStudentsFile(csvFile('Vorname;Nachname\n"Anna, Maria";"von Beispiel"'));
    expect(rows).toEqual([{ firstName: 'Anna, Maria', lastName: 'von Beispiel' }]);
  });

  test('splits a single full-name column', async () => {
    const rows = await parseStudentsFile(csvFile('Name\nMax Mustermann\nAnna Maria Beispiel'));
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann' },
      { firstName: 'Anna Maria', lastName: 'Beispiel' },
    ]);
  });

  test('falls back to positional columns when there is no recognizable header', async () => {
    const rows = await parseStudentsFile(csvFile('Max,Mustermann\nAnna,Beispiel'));
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann' },
      { firstName: 'Anna', lastName: 'Beispiel' },
    ]);
  });

  test('strips a UTF-8 BOM and skips blank rows', async () => {
    const rows = await parseStudentsFile(csvFile('﻿Vorname,Nachname\nMax,Mustermann\n\n,\nAnna,Beispiel'));
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann' },
      { firstName: 'Anna', lastName: 'Beispiel' },
    ]);
  });

  test('drops rows missing a first or last name', async () => {
    const rows = await parseStudentsFile(csvFile('Vorname,Nachname\nMax,\n,Mustermann\nAnna,Beispiel'));
    expect(rows).toEqual([{ firstName: 'Anna', lastName: 'Beispiel' }]);
  });

  test('returns an empty array for an empty file', async () => {
    expect(await parseStudentsFile(csvFile(''))).toEqual([]);
  });

  test('carries a Klasse column through', async () => {
    const rows = await parseStudentsFile(csvFile('Vorname;Nachname;Klasse\nMax;Mustermann;9a\nAnna;Beispiel;10b'));
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann', klasse: '9a' },
      { firstName: 'Anna', lastName: 'Beispiel', klasse: '10b' },
    ]);
  });

  test('carries the class from a full-name + Klasse layout, blank class stays empty', async () => {
    const rows = await parseStudentsFile(csvFile('Name,Klasse\nMax Mustermann,9a\nAnna Beispiel,'));
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann', klasse: '9a' },
      { firstName: 'Anna', lastName: 'Beispiel', klasse: '' },
    ]);
  });
});

describe('parseStudentsFile (formats & robustness)', () => {
  test('tab-separated with header (incl. Klasse)', async () => {
    const rows = await parseStudentsFile(csvFile('Vorname\tNachname\tKlasse\nMax\tMustermann\t9a', 'liste.tsv'));
    expect(rows).toEqual([{ firstName: 'Max', lastName: 'Mustermann', klasse: '9a' }]);
  });

  test('pipe-separated with header', async () => {
    const rows = await parseStudentsFile(csvFile('Vorname|Nachname\nMax|Mustermann'));
    expect(rows).toEqual([{ firstName: 'Max', lastName: 'Mustermann' }]);
  });

  test('.txt file routes through the text parser (tab)', async () => {
    const rows = await parseStudentsFile(csvFile('Max\tMustermann\nAnna\tBeispiel', 'liste.txt'));
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann' },
      { firstName: 'Anna', lastName: 'Beispiel' },
    ]);
  });

  test('English header synonyms in any column order', async () => {
    const rows = await parseStudentsFile(csvFile('Last name,First name\nMustermann,Max'));
    expect(rows).toEqual([{ firstName: 'Max', lastName: 'Mustermann' }]);
  });

  test('further header synonyms (Rufname / Familienname / Lerngruppe)', async () => {
    const rows = await parseStudentsFile(csvFile('Rufname;Familienname;Lerngruppe\nMax;Mustermann;9a'));
    expect(rows).toEqual([{ firstName: 'Max', lastName: 'Mustermann', klasse: '9a' }]);
  });

  test('tolerates punctuation/whitespace/case around header names', async () => {
    const rows = await parseStudentsFile(csvFile('"Vorname:";  NACHNAME \nMax;Mustermann'));
    expect(rows).toEqual([{ firstName: 'Max', lastName: 'Mustermann' }]);
  });

  test('combined "Nachname, Vorname" under a single Name column', async () => {
    const rows = await parseStudentsFile(csvFile('Name\nMustermann, Max\nBeispiel, Anna Maria'));
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann' },
      { firstName: 'Anna Maria', lastName: 'Beispiel' },
    ]);
  });

  test('headerless single column of full names', async () => {
    const rows = await parseStudentsFile(csvFile('Max Mustermann\nAnna Maria Beispiel'));
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann' },
      { firstName: 'Anna Maria', lastName: 'Beispiel' },
    ]);
  });

  test('headerless three columns → Vorname, Nachname, Klasse', async () => {
    const rows = await parseStudentsFile(csvFile('Max;Mustermann;9a\nAnna;Beispiel;10b'));
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann', klasse: '9a' },
      { firstName: 'Anna', lastName: 'Beispiel', klasse: '10b' },
    ]);
  });

  test('XLSX with a Klasse column', async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Vorname', 'Nachname', 'Klasse'],
      ['Max', 'Mustermann', '9a'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Schüler');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const rows = await parseStudentsFile({ name: 'k.xlsx', arrayBuffer: async () => buffer });
    expect(rows).toEqual([{ firstName: 'Max', lastName: 'Mustermann', klasse: '9a' }]);
  });
});

describe('parseStudentsFile (XLSX)', () => {
  test('parses a real workbook via the lazily-loaded xlsx library', async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Vorname', 'Nachname'],
      ['Max', 'Mustermann'],
      ['Anna', 'Beispiel'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Schüler');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = { name: 'schueler.xlsx', arrayBuffer: async () => buffer };

    const rows = await parseStudentsFile(file);
    expect(rows).toEqual([
      { firstName: 'Max', lastName: 'Mustermann' },
      { firstName: 'Anna', lastName: 'Beispiel' },
    ]);
  });
});
