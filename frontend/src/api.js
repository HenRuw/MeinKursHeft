import { io } from 'socket.io-client';

// Empty string = same-origin (requests resolve relative to whatever host/port
// served the page), used when the app sits behind a reverse proxy. Falls
// back to the local backend port when no env var is set at all.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function request(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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
  // students
  listStudents: () => get('/api/students'),
  createStudent: (data) => post('/api/students', data),
  updateStudent: (id, data) => patch(`/api/students/${id}`, data),
  deleteStudent: (id) => del(`/api/students/${id}`),

  // klassen
  listKlassen: () => get('/api/klassen'),
  createKlasse: (data) => post('/api/klassen', data),

  // courses
  listCourses: () => get('/api/courses'),
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

  // remarks
  createRemark: (data) => post('/api/remarks', data),
  updateRemark: (id, data) => patch(`/api/remarks/${id}`, data),
  deleteRemark: (id) => del(`/api/remarks/${id}`),
  listRemarkPresets: () => get('/api/remark-presets'),
  createRemarkPreset: (data) => post('/api/remark-presets', data),
  deleteRemarkPreset: (id) => del(`/api/remark-presets/${id}`),
};

let socket = null;

export function getSocket() {
  if (!socket) {
    // socket.io-client treats an empty/undefined URL as "connect to the
    // current page's origin", which is what we want for the same-origin case.
    socket = io(API_URL || undefined, { transports: ['websocket'], autoConnect: true });
  }
  return socket;
}

// Live-sync: other tabs/windows notify this one that something changed so it
// can refetch. `onChanged({ resource, courseId })`.
export function subscribeSync(onChanged) {
  const activeSocket = getSocket();
  activeSocket.on('sync:changed', onChanged);
  return () => activeSocket.off('sync:changed', onChanged);
}
