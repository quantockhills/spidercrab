import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'spidercrab-theme';

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage may be unavailable (private browsing, etc.)
  }
  return 'system';
}

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(preference: Theme): 'light' | 'dark' {
  if (preference === 'system') return getSystemPreference();
  return preference;
}

function applyThemeClass(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<Theme>(getStoredTheme);

  // Apply the resolved theme class whenever preference changes
  useEffect(() => {
    const resolved = resolveTheme(preference);
    applyThemeClass(resolved);
  }, [preference]);

  // Listen for system preference changes (only relevant when preference === 'system')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const handler = () => {
      if (preference === 'system') {
        applyThemeClass(getSystemPreference());
      }
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference]);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // localStorage may be unavailable
    }
    setPreferenceState(t);
  }, []);

  const resolved = resolveTheme(preference);
  const isDark = resolved === 'dark';

  return { preference, resolved, isDark, setTheme } as const;
}
