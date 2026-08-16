import { describe, expect, it, vi } from 'vitest';

import {
  persistThemePreference,
  readThemePreference,
  THEME_STORAGE_KEY,
} from './theme-preference';

describe('DiffLens P07 theme preference', () => {
  it('reads only supported theme values', () => {
    expect(readThemePreference({ getItem: () => 'dark' })).toBe('dark');
    expect(readThemePreference({ getItem: () => 'light' })).toBe('light');
    expect(readThemePreference({ getItem: () => 'system' })).toBeNull();
    expect(readThemePreference({ getItem: () => null })).toBeNull();
  });

  it('stores only the non-sensitive theme preference under the dedicated key', () => {
    const setItem = vi.fn();
    persistThemePreference('light', { setItem });
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
  });

  it('fails closed when browser storage is unavailable', () => {
    expect(
      readThemePreference({
        getItem: () => {
          throw new Error('storage unavailable');
        },
      }),
    ).toBeNull();

    expect(() =>
      persistThemePreference('dark', {
        setItem: () => {
          throw new Error('storage unavailable');
        },
      }),
    ).not.toThrow();
  });
});
