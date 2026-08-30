// Builds the exportable tables for the Verwaltung > Export screen and
// triggers their download. The screen is organized as a checkbox tree
// (section -> leaf categories); each leaf maps to one "tidy" table here
// (one row per actual data point, courses/students/dates already sorted)
// so the same builder output can become either one sheet of a workbook
// (xlsx/ods), one block of a combined CSV, or one key of a JSON object.

import { sortStudents, fmt, wavg, resolveAverage, mitarbeitAverage, schriftlichAverage, WRITTEN_WORK_GROUP, writtenWorkKindLabel } from './gradeMath.js';

function triggerBlobDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The checkbox tree rendered by Export.jsx. Leaf keys combine as
// `${section.key}.${child.key}` for the selection Set the screen keeps.
export const EXPORT_TREE = [
  {
    key: 'muendlich',
    label: 'Mündliche Mitarbeit',
    children: [
      { key: 'noten', label: 'Mündliche Noten' },
      { key: 'bemerkungen', label: 'Bemerkungen' },
    ],
  },
  {
    key: 'schriftlich',
    label: 'Schriftliche Leistungen',
    children: [
      { key: 'klassenarbeit', label: 'Klassenarbeiten' },
      { key: 'test', label: 'Tests' },
      { key: 'sonstige', label: 'Sonstige Leistungen' },
      { key: 'bemerkungen', label: 'Bemerkungen' },
    ],
  },
  {
    key: 'noten',
    label: 'Noten',
    children: [
      { key: 'quartalsnoten', label: 'Quartalsnoten' },
      { key: 'halbjahresnoten', label: 'Halbjahresnoten' },
      { key: 'zeugnisnoten', label: 'Zeugnisnoten' },
    ],
  },
  {
    key: 'anwesenheit',
    label: 'Anwesenheit',
    children: [
      { key: 'verspaetungen', label: 'Verspätungen' },
      { key: 'fehlstunden', label: 'Fehlstunden' },
      { key: 'unentschuldigt', label: 'Unentschuldigte Fehlstunden' },
    ],
  },
];

export const ALL_LEAF_KEYS = EXPORT_TREE.flatMap((s) => s.children.map((c) => `${s.key}.${c.key}`));

export const EXPORT_FORMATS = [
  ['xlsx', 'Excel (.xlsx)'],
  ['ods', 'ODS (.ods)'],
  ['csv', 'CSV (.csv)'],
  ['json', 'JSON (.json)'],
];

// filter: { mode: 'klasse' | 'jahrgang', klasseId, jahrgang } | null
export function filterStudentsBy(students, filter) {
  if (filter?.mode === 'klasse') return students.filter((s) => String(s.klasse_id) === String(filter.klasseId));
  if (filter?.mode === 'jahrgang') return students.filter((s) => String(s.klasse_jahrgang) === String(filter.jahrgang));
  return students;
}

export function buildStudentListReport(allStudents, filter) {
  const students = sortStudents(filterStudentsBy(allStudents, filter));
  const headers = ['Nachname', 'Vorname', 'Klasse', 'Jahrgang'];
  const rows = students.map((s) => [s.last_name, s.first_name, s.klasse_name || '', s.klasse_jahrgang ?? '']);
  const json = students.map((s) => ({
    nachname: s.last_name,
    vorname: s.first_name,
    klasse: s.klasse_name || null,
    jahrgang: s.klasse_jahrgang ?? null,
  }));
  return { headers, rows, json };
}

function sortedBundles(bundles) {
  return [...bundles].sort((a, b) => a.course.name.localeCompare(b.course.name, 'de'));
}

export function buildMuendlicheNotenReport(bundles) {
  const headers = ['Kurs', 'Nachname', 'Vorname', 'Klasse', 'Datum', 'Thema', 'Note'];
  const rows = [];
  const json = [];
  sortedBundles(bundles).forEach((bundle) => {
    const lessons = [...bundle.lessons].filter((l) => l.grades.some((g) => g.grade)).sort((a, b) => a.date.localeCompare(b.date));
    sortStudents(bundle.students).forEach((s) => {
      lessons.forEach((l) => {
        const att = l.attendance.find((a) => a.student_id === s.id);
        const g = l.grades.find((x) => x.student_id === s.id)?.grade || null;
        const absent = att?.status === 'fehlt';
        const note = absent ? (att.excused ? 'E' : 'F') : g;
        if (note == null) return;
        rows.push([bundle.course.name, s.last_name, s.first_name, s.klasse_name || '', l.date, l.topic || '', note]);
        json.push({ kurs: bundle.course.name, nachname: s.last_name, vorname: s.first_name, klasse: s.klasse_name || null, datum: l.date, thema: l.topic || null, note });
      });
    });
  });
  return { headers, rows, json };
}

export function buildMuendlicheBemerkungenReport(bundles) {
  const headers = ['Kurs', 'Nachname', 'Vorname', 'Klasse', 'Datum', 'Thema', 'Bemerkung'];
  const rows = [];
  const json = [];
  sortedBundles(bundles).forEach((bundle) => {
    const lessons = [...bundle.lessons].sort((a, b) => a.date.localeCompare(b.date));
    sortStudents(bundle.students).forEach((s) => {
      lessons.forEach((l) => {
        const remarks = (l.remarks || []).filter((r) => r.student_id === s.id);
        if (!remarks.length) return;
        const text = remarks.map((r) => (r.emoji ? `${r.emoji} ${r.text}` : r.text)).join('; ');
        rows.push([bundle.course.name, s.last_name, s.first_name, s.klasse_name || '', l.date, l.topic || '', text]);
        json.push({ kurs: bundle.course.name, nachname: s.last_name, vorname: s.first_name, klasse: s.klasse_name || null, datum: l.date, thema: l.topic || null, bemerkung: text });
      });
    });
  });
  return { headers, rows, json };
}

export function buildWrittenWorkReport(bundles, kind) {
  const headers = ['Kurs', 'Nachname', 'Vorname', 'Klasse', 'Titel', 'Datum', 'Note'];
  const rows = [];
  const json = [];
  sortedBundles(bundles).forEach((bundle) => {
    const works = bundle.writtenWorks.filter((w) => w.kind === kind).sort((a, b) => a.date.localeCompare(b.date));
    sortStudents(bundle.students).forEach((s) => {
      works.forEach((w) => {
        const g = w.grades.find((x) => x.student_id === s.id)?.grade || null;
        if (g == null) return;
        rows.push([bundle.course.name, s.last_name, s.first_name, s.klasse_name || '', w.title, w.date, g]);
        json.push({ kurs: bundle.course.name, nachname: s.last_name, vorname: s.first_name, klasse: s.klasse_name || null, titel: w.title, datum: w.date, note: g });
      });
    });
  });
  return { headers, rows, json };
}

export function buildSchriftlichBemerkungenReport(bundles) {
  const headers = ['Kurs', 'Nachname', 'Vorname', 'Klasse', 'Titel', 'Art', 'Datum', 'Bemerkung'];
  const rows = [];
  const json = [];
  sortedBundles(bundles).forEach((bundle) => {
    const works = [...bundle.writtenWorks].sort((a, b) => a.date.localeCompare(b.date));
    sortStudents(bundle.students).forEach((s) => {
      works.forEach((w) => {
        const remarks = (w.remarks || []).filter((r) => r.student_id === s.id);
        if (!remarks.length) return;
        const text = remarks.map((r) => (r.emoji ? `${r.emoji} ${r.text}` : r.text)).join('; ');
        rows.push([bundle.course.name, s.last_name, s.first_name, s.klasse_name || '', w.title, writtenWorkKindLabel(w.kind), w.date, text]);
        json.push({ kurs: bundle.course.name, nachname: s.last_name, vorname: s.first_name, klasse: s.klasse_name || null, titel: w.title, art: w.kind, datum: w.date, bemerkung: text });
      });
    });
  });
  return { headers, rows, json };
}

// Shared cascade (lesson/work grades -> Ø Mitarbeit/Ø Schriftlich per
// quarter -> Q-Note -> HJ-Note -> Zeugnis) behind the three "Noten"
// leaves — each level checks for a manual override first, exactly like
// Notenübersicht itself, so these never drift from what's on screen.
function computeGradeCascade(bundle) {
  const overrides = bundle.gradeOverrides || [];
  const quarters = [...bundle.quarters].sort((a, b) => a.idx - b.idx);
  const halves = [...bundle.halves].sort((a, b) => a.idx - b.idx);

  return sortStudents(bundle.students).map((s) => {
    const quarterResults = quarters.map((quarter) => {
      const lessons = bundle.lessons.filter((l) => l.quarter_id === quarter.id && l.grades.some((g) => g.grade));
      const works = bundle.writtenWorks.filter((w) => w.quarter_id === quarter.id);
      const mitWorks = works.filter((w) => WRITTEN_WORK_GROUP[w.kind] === 'mitarbeit');
      const mit = resolveAverage(overrides, s.id, 'mitAvg', quarter.id, mitarbeitAverage(s.id, lessons, mitWorks));
      const schr = resolveAverage(overrides, s.id, 'schrAvg', quarter.id, schriftlichAverage(s.id, works));
      const qNote = resolveAverage(overrides, s.id, 'qNote', quarter.id, wavg([[mit.value, quarter.weight_mitarbeit], [schr.value, quarter.weight_schriftlich]]));
      return { quarter, qNote };
    });

    const halfResults = halves.map((half) => {
      const qVals = quarterResults.filter((r) => r.quarter.half_id === half.id).map((r) => [r.qNote.value, r.quarter.weight_quarter]);
      const hjNote = resolveAverage(overrides, s.id, 'hjNote', half.id, wavg(qVals));
      return { half, hjNote };
    });

    const zeugnis = resolveAverage(overrides, s.id, 'zeugnis', bundle.course.id, wavg(halfResults.map((r) => [r.hjNote.value, r.half.weight])));

    return { student: s, quarterResults, halfResults, zeugnis };
  });
}

export function buildQuartalsnotenReport(bundles) {
  const headers = ['Kurs', 'Nachname', 'Vorname', 'Klasse', 'Quartal', 'Note', 'Manuell'];
  const rows = [];
  const json = [];
  sortedBundles(bundles).forEach((bundle) => {
    computeGradeCascade(bundle).forEach(({ student: s, quarterResults }) => {
      quarterResults.forEach(({ quarter, qNote }) => {
        if (qNote.value == null) return;
        rows.push([bundle.course.name, s.last_name, s.first_name, s.klasse_name || '', quarter.idx, fmt(qNote.value), qNote.overridden ? 'ja' : 'nein']);
        json.push({ kurs: bundle.course.name, nachname: s.last_name, vorname: s.first_name, klasse: s.klasse_name || null, quartal: quarter.idx, note: qNote.value, manuell: qNote.overridden });
      });
    });
  });
  return { headers, rows, json };
}

export function buildHalbjahresnotenReport(bundles) {
  const headers = ['Kurs', 'Nachname', 'Vorname', 'Klasse', 'Halbjahr', 'Note', 'Manuell'];
  const rows = [];
  const json = [];
  sortedBundles(bundles).forEach((bundle) => {
    computeGradeCascade(bundle).forEach(({ student: s, halfResults }) => {
      halfResults.forEach(({ half, hjNote }) => {
        if (hjNote.value == null) return;
        rows.push([bundle.course.name, s.last_name, s.first_name, s.klasse_name || '', half.idx, fmt(hjNote.value), hjNote.overridden ? 'ja' : 'nein']);
        json.push({ kurs: bundle.course.name, nachname: s.last_name, vorname: s.first_name, klasse: s.klasse_name || null, halbjahr: half.idx, note: hjNote.value, manuell: hjNote.overridden });
      });
    });
  });
  return { headers, rows, json };
}

export function buildZeugnisnotenReport(bundles) {
  const headers = ['Kurs', 'Nachname', 'Vorname', 'Klasse', 'Note', 'Manuell'];
  const rows = [];
  const json = [];
  sortedBundles(bundles).forEach((bundle) => {
    computeGradeCascade(bundle).forEach(({ student: s, zeugnis }) => {
      if (zeugnis.value == null) return;
      rows.push([bundle.course.name, s.last_name, s.first_name, s.klasse_name || '', fmt(zeugnis.value), zeugnis.overridden ? 'ja' : 'nein']);
      json.push({ kurs: bundle.course.name, nachname: s.last_name, vorname: s.first_name, klasse: s.klasse_name || null, note: zeugnis.value, manuell: zeugnis.overridden });
    });
  });
  return { headers, rows, json };
}

// options: { verspaetungen, fehlstunden, unentschuldigt } — which counts to
// include as columns. Every enrolled student gets a row even at all-zero
// (a clean attendance record is itself the answer, not "no data").
export function buildAttendanceReport(bundles, options) {
  const headers = ['Kurs', 'Nachname', 'Vorname', 'Klasse'];
  if (options.verspaetungen) headers.push('Verspätungen');
  if (options.fehlstunden) headers.push('Fehlstunden');
  if (options.unentschuldigt) headers.push('davon unentschuldigt');

  const rows = [];
  const json = [];
  sortedBundles(bundles).forEach((bundle) => {
    sortStudents(bundle.students).forEach((s) => {
      let verspaetet = 0;
      let fehlt = 0;
      let unentschuldigt = 0;
      bundle.lessons.forEach((l) => {
        const att = l.attendance.find((a) => a.student_id === s.id);
        if (!att) return;
        if (att.status === 'verspaetet') verspaetet += 1;
        else if (att.status === 'fehlt') {
          fehlt += 1;
          if (!att.excused) unentschuldigt += 1;
        }
      });
      const row = [bundle.course.name, s.last_name, s.first_name, s.klasse_name || ''];
      if (options.verspaetungen) row.push(verspaetet);
      if (options.fehlstunden) row.push(fehlt);
      if (options.unentschuldigt) row.push(unentschuldigt);
      rows.push(row);

      const j = { kurs: bundle.course.name, nachname: s.last_name, vorname: s.first_name, klasse: s.klasse_name || null };
      if (options.verspaetungen) j.verspaetungen = verspaetet;
      if (options.fehlstunden) j.fehlstunden = fehlt;
      if (options.unentschuldigt) j.unentschuldigt = unentschuldigt;
      json.push(j);
    });
  });
  return { headers, rows, json };
}

// -- multi-section download: one named { headers, rows, json } report per
// checked category, turned into one workbook sheet each (xlsx/ods), one
// block each in a single CSV, or one key each in a JSON object. --

async function downloadWorkbook(filename, sections, bookType) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set();
  sections.forEach(({ label, report }) => {
    const base = label.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
    let name = base;
    let n = 2;
    while (used.has(name)) {
      name = `${base.slice(0, 28)} ${n}`;
      n += 1;
    }
    used.add(name);
    const sheet = XLSX.utils.aoa_to_sheet([report.headers, ...report.rows]);
    XLSX.utils.book_append_sheet(wb, sheet, name);
  });
  XLSX.writeFile(wb, filename, bookType === 'ods' ? { bookType: 'ods' } : undefined);
}

function downloadCsvSections(filename, sections) {
  const blocks = sections.map(({ label, report }) => {
    const lines = [[label], report.headers, ...report.rows];
    return lines.map((r) => r.map(csvEscape).join(';')).join('\r\n');
  });
  const blob = new Blob([`﻿${blocks.join('\r\n\r\n')}`], { type: 'text/csv;charset=utf-8' });
  triggerBlobDownload(filename, blob);
}

function downloadJsonSections(filename, sections) {
  const data = Object.fromEntries(sections.map(({ label, report }) => [label, report.json]));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  triggerBlobDownload(filename, blob);
}

// sections: [{ label, report: { headers, rows, json } }]
export async function downloadSections(format, baseName, sections) {
  const safeName = baseName.replace(/[\\/:*?"<>|]/g, '_');
  if (format === 'xlsx' || format === 'ods') await downloadWorkbook(`${safeName}.${format}`, sections, format);
  else if (format === 'csv') downloadCsvSections(`${safeName}.csv`, sections);
  else downloadJsonSections(`${safeName}.json`, sections);
}
