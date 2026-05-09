import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'dark' | 'light' | 'system';
export type GridSize = 'small' | 'medium' | 'large';

interface AppearanceState {
  theme: Theme;
  gridSize: GridSize;
  setTheme: (t: Theme) => void;
  setGridSize: (g: GridSize) => void;
}

const AppearanceContext = createContext<AppearanceState>({
  theme: 'dark',
  gridSize: 'medium',
  setTheme: () => {},
  setGridSize: () => {},
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [gridSize, setGridSizeState] = useState<GridSize>('medium');

  // Load persisted appearance on mount
  useEffect(() => {
    Promise.all([
      window.electronAPI.getSetting('appearance.theme').catch(() => 'dark'),
      window.electronAPI.getSetting('appearance.gridSize').catch(() => 'medium'),
    ]).then(([t, g]) => {
      if (t) setThemeState(t as Theme);
      if (g) setGridSizeState(g as GridSize);
    });
  }, []);

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (resolved: 'dark' | 'light') => {
      root.classList.remove('dark', 'light');
      root.classList.add(resolved);
      root.setAttribute('data-theme', resolved);
    };

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mq.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      applyTheme(theme);
    }
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    window.electronAPI.setSetting('appearance.theme', t).catch(console.error);
  };

  const setGridSize = (g: GridSize) => {
    setGridSizeState(g);
    window.electronAPI.setSetting('appearance.gridSize', g).catch(console.error);
  };

  return (
    <AppearanceContext.Provider value={{ theme, gridSize, setTheme, setGridSize }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
