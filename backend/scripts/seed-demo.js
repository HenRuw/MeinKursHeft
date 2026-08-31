#!/usr/bin/env node
// Seeds (or resets) a demo course with example students, lessons,
// attendance, participation grades, remarks and written works, so the app
// has something realistic to explore beyond an empty course.
//
// Safe to re-run: it deletes and recreates only the demo course itself
// (identified by its distinctive name); the dummy students it uses are
// looked up by name and reused rather than duplicated on every run.
//
// Usage: npm run seed-demo   (from backend/, with the server already running)
//        API_URL=http://localhost:4000 node scripts/seed-demo.js

const API_URL = process.env.API_URL || 'http://localhost:4000';
const COURSE_NAME = 'Demo-Kurs (Beispieldaten)';

// Each student lists which demo Klasse they belong to (created below if
// missing). A Klasse is just its name.
const KLASSEN = [
  { name: '9a' },
  { name: '9b' },
];

const STUDENTS = [
  ['Amelie', 'Brandt', '9a'],
  ['Jonas', 'Krüger', '9a'],
  ['Lea', 'Hoffmann', '9a'],
  ['Emir', 'Yildiz', '9a'],
  ['Mia', 'Fischer', '9a'],
  ['Elias', 'Schmidt', '9a'],
  ['Hannah', 'Wolf', '9a'],
  ['Luca', 'Becker', '9a'],
  ['Lina', 'Zimmermann', '9a'],
  ['Finn', 'Braun', '9a'],
  ['Emily', 'Krause', '9a'],
  ['Paul', 'Neumann', '9a'],
  ['Mila', 'Schwarz', '9a'],
  ['Anton', 'Richter', '9a'],
  ['Ida', 'Vogel', '9a'],
  ['Marie', 'Schuster', '9b'],
  ['Ben', 'Lorenz', '9b'],
  ['Sophie', 'Wagner', '9b'],
  ['Noah', 'Petrov', '9b'],
  ['Leon', 'Hartmann', '9b'],
  ['Clara', 'Werner', '9b'],
  ['Felix', 'Lange', '9b'],
  ['Frieda', 'Köhler', '9b'],
  ['Max', 'Schäfer', '9b'],
  ['Ella', 'Klein', '9b'],
  ['Julian', 'Fuchs', '9b'],
  ['Greta', 'Berger', '9b'],
  ['David', 'Herrmann', '9b'],
  ['Lena', 'Peters', '9b'],
  ['Tim', 'Krämer', '9b'],
];

const GRADES = ['1', '1+', '1-', '2', '2+', '2-', '3', '3+', '3-', '4', '4+', '4-', '5', '5-', '6'];

function pick(arr, seed) {
  return arr[((seed % arr.length) + arr.length) % arr.length];
}

async function api(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function main() {
  const courses = await api('GET', '/api/courses');
  const existing = courses.find((c) => c.name === COURSE_NAME);
  if (existing) {
    await api('DELETE', `/api/courses/${existing.id}`);
    console.log(`Removed previous "${COURSE_NAME}" (id ${existing.id}).`);
  }

  const course = await api('POST', '/api/courses', { name: COURSE_NAME, hoursPerWeek: 3 });
  console.log(`Created course "${course.name}" (id ${course.id}).`);

  const existingKlassen = await api('GET', '/api/klassen');
  const klasseIdByName = {};
  for (const k of KLASSEN) {
    let klasse = existingKlassen.find((x) => x.name === k.name);
    if (!klasse) klasse = await api('POST', '/api/klassen', k);
    klasseIdByName[k.name] = klasse.id;
  }

  const allStudents = await api('GET', '/api/students');
  const studentIds = [];
  for (const [firstName, lastName, klasseName] of STUDENTS) {
    const klasseId = klasseIdByName[klasseName];
    let s = allStudents.find((x) => x.first_name === firstName && x.last_name === lastName);
    if (!s) s = await api('POST', '/api/students', { firstName, lastName, klasseId });
    else if (s.klasse_id !== klasseId) s = await api('PATCH', `/api/students/${s.id}`, { klasseId });
    await api('POST', `/api/courses/${course.id}/students`, { studentId: s.id });
    studentIds.push(s.id);
  }
  console.log(`Enrolled ${studentIds.length} students.`);

  const bundle = await api('GET', `/api/courses/${course.id}/bundle`);
  const q1 = bundle.quarters.find((q) => q.idx === 1);
  const q2 = bundle.quarters.find((q) => q.idx === 2);
  const q3 = bundle.quarters.find((q) => q.idx === 3);
  const q4 = bundle.quarters.find((q) => q.idx === 4);

  const LESSONS = [
    { date: '2026-08-31', topic: 'Einführung', quarter: q1 },
    { date: '2026-09-07', topic: 'Terme', quarter: q1 },
    { date: '2026-09-14', topic: 'Terme, Übung', quarter: q1 },
    { date: '2026-09-21', topic: 'Lineare Funktionen', quarter: q1 },
    { date: '2026-09-28', topic: 'Steigung', quarter: q1 },
    { date: '2026-10-12', topic: 'Graphen zeichnen', quarter: q1 },
    { date: '2026-10-19', topic: 'Sachaufgaben', quarter: q1 },
    { date: '2026-11-23', topic: 'Gleichungssysteme', quarter: q2 },
    { date: '2026-11-30', topic: 'Gleichungssysteme, Übung', quarter: q2 },
    { date: '2026-12-07', topic: 'Textaufgaben', quarter: q2 },
  ];

  const createdLessons = [];
  let seed = 0;
  for (const l of LESSONS) {
    const lesson = await api('POST', `/api/courses/${course.id}/lessons`, {
      quarterId: l.quarter.id,
      date: l.date,
      durationHours: 1,
      topic: l.topic,
    });
    createdLessons.push(lesson);
    for (const sid of studentIds) {
      seed += 1;
      const roll = (seed * 37) % 100;
      let status = 'anwesend';
      let lateMinutes;
      if (roll < 8) status = 'fehlt';
      else if (roll < 20) {
        status = 'verspaetet';
        lateMinutes = 5 + (seed % 10);
      }
      await api('PUT', `/api/lessons/${lesson.id}/attendance/${sid}`, {
        status,
        lateMinutes,
        excused: status === 'fehlt' && roll < 4,
      });
      if (status !== 'fehlt') {
        await api('PUT', `/api/lessons/${lesson.id}/grade/${sid}`, { grade: pick(GRADES, seed + sid) });
      }
    }
  }
  console.log(`Created ${LESSONS.length} lessons with attendance + participation grades.`);

  const presets = await api('GET', '/api/remark-presets');
  if (presets.length && createdLessons.length) {
    await api('POST', '/api/remarks', {
      targetType: 'lesson',
      targetId: createdLessons[0].id,
      studentId: studentIds[1],
      emoji: presets[0].emoji,
      text: presets[0].text,
    });
    const other = presets[2] || presets[0];
    await api('POST', '/api/remarks', {
      targetType: 'lesson',
      targetId: createdLessons[2].id,
      studentId: studentIds[4],
      emoji: other.emoji,
      text: other.text,
    });
  }

  // 4 Klassenarbeiten per Halbjahr (2 per Quartal), spanning the whole
  // year -- q1/q2 make up 1. Halbjahr, q3/q4 make up 2. Halbjahr.
  const WORKS = [
    { kind: 'klassenarbeit', title: '1. Klassenarbeit', content: 'Terme, lineare Funktionen', date: '2026-09-25', weight: 2, quarter: q1 },
    { kind: 'test', title: 'Kurztest Terme', content: 'Ausmultiplizieren, Ausklammern', date: '2026-09-11', weight: 1, quarter: q1 },
    { kind: 'sonstige', title: 'Hausaufgabenheft', content: 'Vollständigkeit & Ordentlichkeit', date: '2026-10-16', weight: 0.5, quarter: q1 },
    { kind: 'klassenarbeit', title: '2. Klassenarbeit', content: 'Steigung, Sachaufgaben', date: '2026-11-06', weight: 2, quarter: q1 },
    { kind: 'klassenarbeit', title: '3. Klassenarbeit', content: 'Gleichungssysteme', date: '2026-12-02', weight: 2, quarter: q2 },
    { kind: 'test', title: 'Kurztest Gleichungssysteme', content: 'Einsetzungs- & Additionsverfahren', date: '2026-11-27', weight: 1, quarter: q2 },
    { kind: 'klassenarbeit', title: '4. Klassenarbeit', content: 'Textaufgaben', date: '2027-01-20', weight: 2, quarter: q2 },
    { kind: 'klassenarbeit', title: '5. Klassenarbeit', content: 'Quadratische Funktionen', date: '2027-02-26', weight: 2, quarter: q3 },
    { kind: 'klassenarbeit', title: '6. Klassenarbeit', content: 'Satz des Pythagoras', date: '2027-03-26', weight: 2, quarter: q3 },
    { kind: 'klassenarbeit', title: '7. Klassenarbeit', content: 'Wahrscheinlichkeitsrechnung', date: '2027-05-14', weight: 2, quarter: q4 },
    { kind: 'klassenarbeit', title: '8. Klassenarbeit', content: 'Abschlusstest Jahresstoff', date: '2027-06-25', weight: 2, quarter: q4 },
  ];

  for (const w of WORKS) {
    const work = await api('POST', `/api/courses/${course.id}/written-works`, {
      quarterId: w.quarter.id,
      kind: w.kind,
      title: w.title,
      content: w.content,
      date: w.date,
      weight: w.weight,
    });
    for (const sid of studentIds) {
      seed += 1;
      await api('PUT', `/api/written-works/${work.id}/grade/${sid}`, { grade: pick(GRADES, seed * 3 + sid) });
    }
  }
  console.log(`Created ${WORKS.length} written works (Klassenarbeiten/Tests/Sonstige) with grades.`);

  console.log(`\nDone. Open the app and select "${course.name}" in the sidebar.`);
}

main().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
