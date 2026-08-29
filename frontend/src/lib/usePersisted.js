import { useEffect, useState } from 'react';

// A useState that mirrors its value to localStorage under `key`, so simple
// view preferences (scope filters, collapsed sections, ...) survive reloads.
export function usePersisted(key, initial) {
  const [value, setValue] = useState(() => {
    const raw = localStorage.getItem(key);
    return raw == null ? initial : JSON.parse(raw);
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]);
  return [value, setValue];
}
