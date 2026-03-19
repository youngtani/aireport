import { useState, useCallback } from 'react';

export function useLocalStorage(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  });

  const set = useCallback(
    (next) => {
      setValue((prev) => {
        const val = typeof next === 'function' ? next(prev) : next;
        localStorage.setItem(key, JSON.stringify(val));
        return val;
      });
    },
    [key],
  );

  return [value, set];
}
