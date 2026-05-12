import { useState, useEffect } from 'react';

export type ThemeValue = 'light' | 'dark' | 'system';

/**
 * The localStorage key used by both this hook and the
 * anti-flash inline script in index.html to ensure the
 * correct theme is applied before React hydrates.
 */
export const THEME_STORAGE_KEY = 'tg-theme';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Resolve 'system' to the actual OS preference. */
function resolveTheme(t: ThemeValue): 'light' | 'dark' {
  if (t !== 'system') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Write the resolved value to document.documentElement[data-theme]. */
function applyTheme(t: ThemeValue): void {
  document.documentElement.setAttribute('data-theme', resolveTheme(t));
}

// ── hook ─────────────────────────────────────────────────────────────────────

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeValue>('light');

  // ── On mount: restore saved theme ──────────────────────────────────────────
  useEffect(() => {
    // Prefer electron-store (authoritative). Fall back to localStorage so
    // the UI is consistent with what the anti-flash script already applied.
    const persisted =
      (window.electronAPI?.getSetting('appearance.theme') as Promise<string | null>)?.catch(
        () => null,
      ) ?? Promise.resolve(null);

    persisted.then((saved) => {
      const t = (saved || localStorage.getItem(THEME_STORAGE_KEY) || 'light') as ThemeValue;
      applyTheme(t);
      setThemeState(t);
    });
  }, []);

  // ── When theme === 'system', track OS preference changes live ──────────────
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // ── Public setter ──────────────────────────────────────────────────────────
  function setTheme(t: ThemeValue): void {
    setThemeState(t);
    applyTheme(t);

    // Persist to localStorage so the anti-flash script picks it up on next load
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch (_) {
      // incognito / storage quota — not fatal
    }

    // Persist to electron-store (async, fire-and-forget)
    window.electronAPI?.setSetting('appearance.theme', t).catch(console.error);
  }

  return { theme, setTheme };
}
