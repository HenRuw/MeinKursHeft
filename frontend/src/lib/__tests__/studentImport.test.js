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
