import { io } from 'socket.io-client';

// Empty string = same-origin (requests resolve relative to whatever host/port
// served the page), used when the app sits behind a reverse proxy. Falls
// back to the local backend port when no env var is set at all.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// The app is guarded by a single session cookie (see backend/src/auth.js).
// A 401 from any *non-auth* endpoint means the session is gone/expired; we
// notify the AuthGate so it can drop back to the login mask. Login/logout/
// session probes handle their own 401s and must not trigger this.
const AUTH_PATHS = new Set(['/api/login', '/api/logout', '/api/session']);
let unauthorizedHandler = null;
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

async function request(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    // Send/receive the session cookie, including cross-origin in dev.
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !AUTH_PATHS.has(path)) {
    if (unauthorizedHandler) unauthorizedHandler();
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `${method} ${path} failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body ?? {});
const patch = (path, body) => request('PATCH', path, body ?? {});
const put = (path, body) => request('PUT', path, body ?? {});
const del = (path) => request('DELETE', path);

export const api = {
  // school years + the year the UI opens on
  getYearContext: () => get('/api/year-context'),
  setCurrentYear: (yearId) => put('/api/year-context', { yearId }),
  listYears: () => get('/api/years'),
  createYear: (data) => post('/api/years', data),
  updateYear: (id, data) => patch(`/api/years/${id}`, data),
  // hard delete, gated on retyping the exact label
  deleteYear: (id, confirmLabel) => del(`/api/years/${id}?confirmLabel=${encodeURIComponent(confirmLabel)}`),
  advanceYear: (data) => post('/api/years/advance', data),

  // per-year quarter calendar (single source of truth for quarter dates)
  getYearQuarters: (yearId) => get(`/api/years/${yearId}/quarters`),
  setYearQuarters: (yearId, ranges) => put(`/api/years/${yearId}/quarters`, { ranges }),

  // classes (year-scoped)
  listClasses: (yearId) => get(`/api/years/${yearId}/classes`),
  createClass: (yearId, data) => post(`/api/years/${yearId}/classes`, data),
  renameClass: (id, data) => patch(`/api/classes/${id}`, data),
  deleteClass: (id) => del(`/api/classes/${id}`),

  // students — year-scoped over the shared person pool
  listStudents: (yearId) => get(yearId ? `/api/students?yearId=${yearId}` : '/api/students'),
  createStudent: (data) => post('/api/students', data),
  updateStudent: (id, data) => patch(`/api/students/${id}`, data),
  // remove from one year only, or (global=1) delete the person everywhere
  removeStudentFromYear: (id, yearId) => del(`/api/students/${id}?yearId=${yearId}`),
  deleteStudentGlobally: (id) => del(`/api/students/${id}?global=1`),
  linkStudentToYear: (id, data) => post(`/api/students/${id}/link`, data),
  matchStudents: (names) => post('/api/students/match', { names }),
  listUnassignedStudents: () => get('/api/students/unassigned'),

  // courses (year-scoped)
  listCourses: (yearId) => get(yearId ? `/api/courses?yearId=${yearId}` : '/api/courses'),
  createCourse: (data) => post('/api/courses', data),
  updateCourse: (id, data) => patch(`/api/courses/${id}`, data),
  deleteCourse: (id) => del(`/api/courses/${id}`),
  getCourseBundle: (id) => get(`/api/courses/${id}/bundle`),
  enrollStudent: (courseId, studentId) => post(`/api/courses/${courseId}/students`, { studentId }),
  unenrollStudent: (courseId, studentId) => del(`/api/courses/${courseId}/students/${studentId}`),

  // quarters / halves
  updateQuarter: (id, data) => patch(`/api/quarters/${id}`, data),
  updateHalf: (id, data) => patch(`/api/halves/${id}`, data),

  // lessons
  createLesson: (courseId, data) => post(`/api/courses/${courseId}/lessons`, data),
  updateLesson: (id, data) => patch(`/api/lessons/${id}`, data),
  deleteLesson: (id) => del(`/api/lessons/${id}`),
  setAttendance: (lessonId, studentId, data) => put(`/api/lessons/${lessonId}/attendance/${studentId}`, data),
  setGrade: (lessonId, studentId, grade) => put(`/api/lessons/${lessonId}/grade/${studentId}`, { grade }),

  // written works
  createWrittenWork: (courseId, data) => post(`/api/courses/${courseId}/written-works`, data),
  updateWrittenWork: (id, data) => patch(`/api/written-works/${id}`, data),
  deleteWrittenWork: (id) => del(`/api/written-works/${id}`),
  setWrittenWorkGrade: (workId, studentId, grade) => put(`/api/written-works/${workId}/grade/${studentId}`, { grade }),

  // grade overrides — a null grade clears the override (reset to calculated)
  setGradeOverride: (courseId, data) => put(`/api/courses/${courseId}/grade-overrides`, data),
  // average locks — freeze/unfreeze a single Ø/Q/HJ/Zeugnis cell against editing
  setAverageLock: (courseId, data) => put(`/api/courses/${courseId}/average-locks`, data),
  // freeze/unfreeze a whole average column (all enrolled students) at once
  setAverageLockColumn: (courseId, data) => put(`/api/courses/${courseId}/average-lock-columns`, data),

  // remarks
  createRemark: (data) => post('/api/remarks', data),
  updateRemark: (id, data) => patch(`/api/remarks/${id}`, data),
  deleteRemark: (id) => del(`/api/remarks/${id}`),
  listRemarkPresets: () => get('/api/remark-presets'),
  createRemarkPreset: (data) => post('/api/remark-presets', data),
  deleteRemarkPreset: (id) => del(`/api/remark-presets/${id}`),

  // backup — download a full JSON snapshot, or restore one (replaces everything)
  getBackup: () => get('/api/backup'),
  restoreBackup: (data) => post('/api/backup/restore', data),

  // auth — single-password session (see backend/src/auth.js)
  getSession: () => get('/api/session'),
  login: (password) => post('/api/login', { password }),
  logout: () => post('/api/logout'),
};

let socket = null;

export function getSocket() {
  if (!socket) {
    // socket.io-client treats an empty/undefined URL as "connect to the
    // current page's origin", which is what we want for the same-origin case.
    // withCredentials sends the session cookie on the handshake so the server
    // can authenticate the WebSocket the same way it does REST calls.
    socket = io(API_URL || undefined, {
      transports: ['websocket'],
      autoConnect: true,
      withCredentials: true,
    });
    // The server rejects an unauthenticated handshake with "unauthorized";
    // treat that like a REST 401 so the app returns to the login mask.
    socket.on('connect_error', (err) => {
      if (err && /unauthorized/i.test(err.message) && unauthorizedHandler) unauthorizedHandler();
    });
  }
  return socket;
}

// Drop the live-sync socket — used on logout and when the session ends, so a
// stale connection doesn't keep retrying with a dead cookie.
export function resetSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Live-sync: other tabs/windows notify this one that something changed so it
// can refetch. `onChanged({ resource, courseId })`.
export function subscribeSync(onChanged) {
  const activeSocket = getSocket();
  activeSocket.on('sync:changed', onChanged);
  return () => activeSocket.off('sync:changed', onChanged);
}
