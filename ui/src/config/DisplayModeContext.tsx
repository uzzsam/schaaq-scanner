import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { LABELS, getLabel, getCostCategoryLabels, type DisplayMode, type LabelKey } from './displayLabels';

interface DisplayModeContextValue {
  mode: DisplayMode;
  toggleMode: () => void;
  label: (key: LabelKey) => string;
  costCategoryLabels: Record<string, string>;
}

const DisplayModeContext = createContext<DisplayModeContextValue | null>(null);

const STORAGE_KEY = 'schaaq_display_mode';

export function DisplayModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DisplayMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'technical' || stored === 'executive') return stored;
    } catch { /* ignore */ }
    return 'executive'; // default
  });

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'technical' ? 'executive' : 'technical';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const label = useCallback((key: LabelKey) => getLabel(key, mode), [mode]);
  const costCategoryLabels = getCostCategoryLabels(mode);

  return (
    <DisplayModeContext.Provider value={{ mode, toggleMode, label, costCategoryLabels }}>
      {children}
    </DisplayModeContext.Provider>
  );
}

export function useDisplayMode(): DisplayModeContextValue {
  const ctx = useContext(DisplayModeContext);
  if (!ctx) throw new Error('useDisplayMode must be used within DisplayModeProvider');
  return ctx;
}
