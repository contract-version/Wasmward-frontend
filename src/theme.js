/** The themes a person can choose: follow the system, or force light or dark. */
export const THEMES = ['auto', 'light', 'dark'];

export const DEFAULT_THEME = 'auto';

/** Where the choice is kept in the browser's storage. */
export const STORAGE_KEY = 'wasmward-theme';

const isTheme = (value) => typeof value === 'string' && THEMES.includes(value);

/**
 * The saved choice, or the default. Storage can be missing or can throw (some private modes, blocked site data), and a
 * saved value can be anything, so this never throws and only ever returns one of the three themes.
 */
export function readTheme(storage) {
  try {
    const saved = storage.getItem(STORAGE_KEY);
    return isTheme(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Saves a choice. Returns whether it was saved: false for something that is not a theme, or storage that failed. */
export function saveTheme(storage, theme) {
  if (!isTheme(theme)) return false;
  try {
    storage.setItem(STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

/**
 * Puts the theme on the page's root element as `data-theme`, which the stylesheet reads. `auto` removes it, so the
 * system's light or dark setting decides. Anything that is not a theme is treated as `auto`, so nothing but one of
 * three fixed words is ever written into the page.
 */
export function applyTheme(root, theme) {
  if (isTheme(theme) && theme !== DEFAULT_THEME) root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

/**
 * Reads the saved theme and applies it, for the small script that runs in <head> before the page is drawn, so a
 * saved choice does not flash the system's theme first. Returns the theme that was applied.
 */
export function initTheme(root, storage) {
  const theme = readTheme(storage);
  applyTheme(root, theme);
  return theme;
}
