import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useTheme, ThemeValue } from '../hooks/useTheme';

export type Theme = ThemeValue;
export type GridSize = 'small' | 'medium' | 'large';

interface AppearanceState {
  theme: Theme;
  gridSize: GridSize;
  setTheme: (t: Theme) => void;
  setGridSize: (g: GridSize) => void;
}

const AppearanceContext = createContext<AppearanceState>({
  theme: 'light',
  gridSize: 'medium',
  setTheme: () => {},
  setGridSize: () => {},
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  // useTheme owns all data-theme DOM mutations, localStorage, and electron-store
  // persistence for the theme. No duplicate logic here.
  const { theme, setTheme } = useTheme();
  const [gridSize, setGridSizeState] = useState<GridSize>('medium');

  // Load persisted grid-size preference on mount
  useEffect(() => {
    window.electronAPI
      ?.getSetting('appearance.gridSize')
      .then((g) => {
        if (g) setGridSizeState(g as GridSize);
      })
      .catch(() => {});
  }, []);

  const setGridSize = (g: GridSize) => {
    setGridSizeState(g);
    window.electronAPI?.setSetting('appearance.gridSize', g).catch(console.error);
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
