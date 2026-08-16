export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'difflens-theme';

interface ThemeStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export function initialTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const stored = readThemePreference(window.localStorage);
  if (stored !== null) {
    return stored;
  }

  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function readThemePreference(storage: Pick<ThemeStorage, 'getItem'>): Theme | null {
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

export function persistThemePreference(
  theme: Theme,
  storage: Pick<ThemeStorage, 'setItem'> | undefined =
    typeof window === 'undefined' ? undefined : window.localStorage,
): void {
  if (storage === undefined) {
    return;
  }

  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme persistence is optional and must never block the comparison workflow.
  }
}
