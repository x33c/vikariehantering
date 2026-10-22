import { useEffect, useRef, useState } from 'react';

export function useDarkMode() {
  const [mörkt, setMörkt] = useState(() => document.documentElement.classList.contains('dark'));
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => {
    clearTimeout(timer.current);
    document.documentElement.classList.remove('theme-changing');
  }, []);

  function toggla() {
    const root = document.documentElement;
    const next = !root.classList.contains('dark');
    clearTimeout(timer.current);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theme-changing');
      // Establish the transition before changing the theme variables.
      void root.offsetWidth;
      timer.current = setTimeout(() => root.classList.remove('theme-changing'), 300);
    } else {
      root.classList.remove('theme-changing');
    }
    root.classList.toggle('dark', next);
    setMörkt(next);
    try { localStorage.setItem('tema', next ? 'dark' : 'light'); } catch { /* Theme still works when storage is blocked. */ }
  }

  return { mörkt, toggla };
}
